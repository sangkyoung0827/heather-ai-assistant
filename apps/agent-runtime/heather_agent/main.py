from collections import defaultdict, deque
from importlib.metadata import version
from time import monotonic
from fastapi import Depends, FastAPI, HTTPException, Request
from .auth import execution_context
from .config import Settings
from .models import ExecuteRequest, ExecutionContext, RouteRequest, RouteResponse, SkillRunResponse
from .registry import SKILLS
from .supabase import SupabaseGateway
from .workflow import PersonalMemorySummaryWorkflow

settings = Settings()
gateway = SupabaseGateway(settings)
workflow = PersonalMemorySummaryWorkflow(settings, gateway)
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
async def health() -> dict[str, str]:
    return {"status": "ok", "nemo_agent_toolkit": version("nvidia-nat")}


@app.post("/v1/skills/route", response_model=RouteResponse)
async def route_skill(payload: RouteRequest, request: Request) -> RouteResponse:
    await context_for(request, payload.locale)
    message = payload.message.casefold()
    memory_terms = ("memory", "memories", "remember", "기억", "메모리", "내 메모")
    summary_terms = ("summary", "summarize", "overview", "요약", "정리", "한눈")
    if any(term in message for term in memory_terms) and any(term in message for term in summary_terms):
        return RouteResponse(skill_id="personal_memory_summary", confidence=0.95, reason="Personal memory summary request.")
    return RouteResponse(confidence=0.0, reason="No enabled skill matched with sufficient confidence.")


@app.post("/v1/skills/execute", response_model=SkillRunResponse)
async def execute_skill(payload: ExecuteRequest, request: Request) -> SkillRunResponse:
    context = await context_for(request, payload.locale)
    definition = SKILLS.get(payload.skill_id)
    if not definition or not definition.enabled:
        raise HTTPException(status_code=404, detail="Skill is not available.")
    return await workflow.execute(context, payload.max_memories)


@app.get("/v1/skill-runs/{run_id}", response_model=SkillRunResponse)
async def skill_run(run_id: str, request: Request, locale: str = "ko") -> SkillRunResponse:
    context = await context_for(request, locale)
    try:
        return await gateway.get_run(context, run_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail="Skill run not found.") from error

