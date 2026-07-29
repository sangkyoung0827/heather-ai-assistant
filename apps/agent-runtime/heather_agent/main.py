from collections import defaultdict, deque
from importlib.metadata import version
from time import monotonic
import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.security import HTTPBearer
from .auth import execution_context
from .config import Settings
from .models import ExecuteRequest, ExecutionContext, RouteRequest, RouteResponse, RunStatus, SkillRunResponse
from .production import ProductionCompareRequest, ProductionExperimentPlan, ProductionExperimentRequest, ProductionParseRequest, parse_instruction, simulate
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
bearer_scheme = HTTPBearer(auto_error=False)


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
    searxng_reachable = await search_workflow.searxng.health_check()
    providers = {
        "searxng": {"status": "configured" if searxng_reachable else "not_configured"},
        "openalex": {"status": "configured" if settings.openalex_api_key else "free_no_key"},
        "crossref": {"status": "configured" if settings.crossref_mailto else "free_no_contact"},
        "pubmed": {"status": "configured" if settings.ncbi_api_key else "free_low_rate"},
        "europe_pmc": {"status": "configured"},
        "unpaywall": {"status": "configured" if settings.unpaywall_email else "not_configured"},
        "semantic_scholar": {"status": "configured" if settings.semantic_scholar_api_key else "free_low_rate"},
    }
    return {"status": "ok", "version": app.version, "nemo_agent_toolkit": version("nvidia-nat"), "providers": providers, "paid_fallback_enabled": False}


@app.post("/v1/skills/route", response_model=RouteResponse, dependencies=[Depends(bearer_scheme)])
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


@app.post("/v1/skills/execute", response_model=SkillRunResponse, dependencies=[Depends(bearer_scheme)])
async def execute_skill(payload: ExecuteRequest, request: Request) -> SkillRunResponse:
    context = await context_for(request, payload.locale)
    context = context.model_copy(update={
        "research_scope": payload.research_scope,
        "team_id": payload.team_id,
        "project_id": payload.project_id,
    })
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


@app.get("/v1/skill-runs/{run_id}", response_model=SkillRunResponse, dependencies=[Depends(bearer_scheme)])
async def skill_run(run_id: str, request: Request, locale: str = "ko") -> SkillRunResponse:
    context = await context_for(request, locale)
    try:
        return await gateway.get_run(context, run_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail="Skill run not found.") from error


@app.post("/v1/production/parse", dependencies=[Depends(bearer_scheme)])
async def parse_production_experiment(payload: ProductionParseRequest, request: Request, locale: str = "ko") -> dict:
    await context_for(request, locale)
    try:
        plan = parse_instruction(payload.instruction, payload.random_seed)
    except ValueError as error:
        raise HTTPException(status_code=422, detail={"code": str(error), "message": "The requested simulation condition is outside the selected profile envelope."}) from error
    return {"plan": plan.model_dump(), "requires_confirmation": True, "simulation_only": True}


@app.post("/v1/production/experiments", dependencies=[Depends(bearer_scheme)])
async def create_production_experiment(payload: ProductionExperimentRequest, request: Request, locale: str = "ko") -> dict:
    context = await context_for(request, locale)
    try:
        plan = payload.plan or parse_instruction(payload.instruction, payload.random_seed)
        row = await gateway.create_production_experiment(context, payload.instruction, plan.model_dump(), payload.title or f"DHA simulation {plan.profile_id}")
    except ValueError as error:
        raise HTTPException(status_code=422, detail={"code": str(error), "message": "The requested simulation condition is outside the selected profile envelope."}) from error
    except httpx.HTTPError as error:
        raise HTTPException(status_code=503, detail="Production experiment storage is unavailable. Apply migration 008 and retry.") from error
    return {"experiment": row, "requires_confirmation": True}


@app.post("/v1/production/experiments/{experiment_id}/run", dependencies=[Depends(bearer_scheme)])
async def run_production_experiment(experiment_id: str, request: Request, locale: str = "ko") -> dict:
    context = await context_for(request, locale)
    try:
        experiment = await gateway.get_production_experiment(context, experiment_id)
        result = simulate(ProductionExperimentPlan.model_validate(experiment["parsed_plan"]))
        payload = result.model_dump()
        await gateway.complete_production_experiment(context, experiment_id, payload)
        return {"experiment_id": experiment_id, "status": "completed", "result": payload}
    except LookupError as error:
        raise HTTPException(status_code=404, detail="Production experiment not found.") from error
    except httpx.HTTPError as error:
        raise HTTPException(status_code=503, detail="Production experiment storage is unavailable.") from error


@app.get("/v1/production/experiments", dependencies=[Depends(bearer_scheme)])
async def list_production_experiments(request: Request, locale: str = "ko", limit: int = 25) -> dict:
    context = await context_for(request, locale)
    try:
        return {"experiments": await gateway.list_production_experiments(context, limit)}
    except httpx.HTTPError as error:
        raise HTTPException(status_code=503, detail="Production experiment storage is unavailable.") from error


@app.get("/v1/production/experiments/{experiment_id}", dependencies=[Depends(bearer_scheme)])
async def get_production_experiment(experiment_id: str, request: Request, locale: str = "ko") -> dict:
    context = await context_for(request, locale)
    try:
        return {"experiment": await gateway.get_production_experiment(context, experiment_id)}
    except LookupError as error:
        raise HTTPException(status_code=404, detail="Production experiment not found.") from error


@app.post("/v1/production/compare", dependencies=[Depends(bearer_scheme)])
async def compare_production_experiments(payload: ProductionCompareRequest, request: Request, locale: str = "ko") -> dict:
    context = await context_for(request, locale)
    experiments = [await gateway.get_production_experiment(context, experiment_id) for experiment_id in payload.experiment_ids]
    completed = [item for item in experiments if item.get("final_result")]
    if len(completed) < 2:
        raise HTTPException(status_code=422, detail="At least two completed simulations are required for comparison.")
    baseline, candidate = completed[0], completed[1]
    left, right = baseline["final_result"]["final_metrics"], candidate["final_result"]["final_metrics"]
    return {"comparison": {"baseline_id": baseline["id"], "candidate_id": candidate["id"], "dha_g_l_delta": round(right["final_dha_g_l"] - left["final_dha_g_l"], 3), "dha_percent_delta": round(right["dha_percent_total_fatty_acids"] - left["dha_percent_total_fatty_acids"], 2), "biomass_delta": round(right["final_biomass_g_l"] - left["final_biomass_g_l"], 3), "tradeoff": "Simulation-only comparison. DHA percentage and total DHA concentration can move in different directions; laboratory validation is required."}}


@app.post("/v1/production/experiments/{experiment_id}/literature", dependencies=[Depends(bearer_scheme)])
async def production_literature(experiment_id: str, request: Request, locale: str = "ko") -> dict:
    context = await context_for(request, locale)
    experiment = await gateway.get_production_experiment(context, experiment_id)
    query = "Schizochytrium DHA nitrogen limitation dissolved oxygen fed-batch"
    result = await search_workflow.execute(context, "research_academic_discovery", query)
    return {"experiment_id": experiment["id"], "query": query, "sources": result["sources"][:5], "evidence_level": "metadata_only", "limitation": "Metadata-only sources do not support strong causal conclusions."}
