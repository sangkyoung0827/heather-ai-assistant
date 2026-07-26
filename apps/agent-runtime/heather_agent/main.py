from collections import defaultdict, deque
from importlib.metadata import version
from time import monotonic
from fastapi import Depends, FastAPI, HTTPException, Request
from .auth import execution_context
from .config import Settings
from .models import ExecuteRequest, ExecutionContext, RouteRequest, RouteResponse, RunStatus, SkillRunResponse
from .registry import SKILLS
from .supabase import SupabaseGateway
from .workflow import PersonalMemorySummaryWorkflow
from .search import ProviderError, SearchCache, SearchWorkflow

settings = Settings()
gateway = SupabaseGateway(settings)
workflow = PersonalMemorySummaryWorkflow(settings, gateway)
search_workflow = SearchWorkflow(settings, SearchCache(settings))
app = FastAPI(title="Heather Agent Runtime", version="0.1.0")
rate_windows: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(context: ExecutionContext) -> None:
    now = monotonic()
    window = rate_windows[context.user_id]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= 12:
        raise HTTPException(status_code=429, detail="Too many skill requests.")
    window.append(now)


async def context_for(request: Request, locale: str = "ko") -> ExecutionContext:
    context = await execution_context(request, settings, locale)
    rate_limit(context)
    return context


@app.get("/health")
async def health() -> dict:
    providers = {
        "searxng": {"status": "configured" if search_workflow.searxng.enabled else "not_configured"},
        "openalex": {"status": "configured" if settings.openalex_api_key else "free_no_key"},
        "crossref": {"status": "configured" if settings.crossref_mailto else "free_no_contact"},
        "pubmed": {"status": "configured" if settings.ncbi_api_key else "free_low_rate"},
        "europe_pmc": {"status": "configured"},
        "unpaywall": {"status": "configured" if settings.unpaywall_email else "not_configured"},
        "semantic_scholar": {"status": "configured" if settings.semantic_scholar_api_key else "free_low_rate"},
    }
    return {"status": "ok", "version": app.version, "nemo_agent_toolkit": version("nvidia-nat"), "providers": providers, "paid_fallback_enabled": False}


@app.post("/v1/skills/route", response_model=RouteResponse)
async def route_skill(payload: RouteRequest, request: Request) -> RouteResponse:
    await context_for(request, payload.locale)
    message = payload.message.casefold()
    memory_terms = ("memory", "memories", "remember", "기억", "메모리", "내 메모")
    summary_terms = ("summary", "summarize", "overview", "요약", "정리", "한눈")
    if any(term in message for term in memory_terms) and any(term in message for term in summary_terms):
        return RouteResponse(skill_id="personal_memory_summary", confidence=0.95, reason="Personal memory summary request.")
    explicit = ("search", "find", "latest", "current", "source", "sources", "paper", "papers", "doi", "citation", "citations", "검색", "찾아", "최신", "현재", "출처", "논문", "인용")
    if not any(term in message for term in explicit):
        return RouteResponse(confidence=0.0, reason="No explicit discovery need.")
    if payload.space == "personal":
        return RouteResponse(skill_id="general_web_search", confidence=0.92, reason="Explicit personal web search request.")
    academic = ("paper", "papers", "doi", "citation", "journal", "study", "논문", "인용", "학술", "연구 결과")
    return RouteResponse(skill_id="research_academic_discovery" if any(term in message for term in academic) else "research_web_discovery", confidence=0.91, reason="Explicit research discovery request.")


@app.post("/v1/skills/execute", response_model=SkillRunResponse)
async def execute_skill(payload: ExecuteRequest, request: Request) -> SkillRunResponse:
    context = await context_for(request, payload.locale)
    definition = SKILLS.get(payload.skill_id)
    if not definition or not definition.enabled:
        raise HTTPException(status_code=404, detail="Skill is not available.")
    if payload.skill_id == "personal_memory_summary":
        return await workflow.execute(context, payload.max_memories)
    if not payload.query:
        raise HTTPException(status_code=400, detail="A search query is required.")
    if definition.scope == "research":
        try:
            await gateway.validate_research_scope(context, payload.research_scope, payload.team_id, payload.project_id)
        except PermissionError as error:
            raise HTTPException(status_code=403, detail=str(error)) from error
    run_id = await gateway.create_run(context, definition.id, definition.version)
    try:
        await gateway.update_run(context, run_id, RunStatus.RUNNING)
        result = await search_workflow.execute(context, definition.id, payload.query)
        if definition.scope == "research":
            await gateway.log_research_search(context, payload.research_scope, payload.team_id, payload.project_id, result["provider"], payload.query, len(result["sources"]))
        await gateway.step(context, run_id, 1, definition.required_tools[0], RunStatus.COMPLETED, {"query_length": len(payload.query)}, {"source_count": len(result["sources"]), "cached": result["cached"], "paid_api_calls": 0})
        await gateway.update_run(context, run_id, RunStatus.COMPLETED, {"source_count": len(result["sources"]), "provider": result["provider"], "paid_api_calls": 0, "result": result})
        return SkillRunResponse(run_id=run_id, status=RunStatus.COMPLETED, skill_id=definition.id, result=result)
    except ProviderError as error:
        await gateway.update_run(context, run_id, RunStatus.FAILED, error_code=str(error))
        return SkillRunResponse(run_id=run_id, status=RunStatus.FAILED, skill_id=definition.id, error_code=str(error))
    except Exception:
        await gateway.update_run(context, run_id, RunStatus.FAILED, error_code="search_execution_failed")
        return SkillRunResponse(run_id=run_id, status=RunStatus.FAILED, skill_id=definition.id, error_code="search_execution_failed")


@app.get("/v1/skill-runs/{run_id}", response_model=SkillRunResponse)
async def skill_run(run_id: str, request: Request, locale: str = "ko") -> SkillRunResponse:
    context = await context_for(request, locale)
    try:
        return await gateway.get_run(context, run_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail="Skill run not found.") from error
