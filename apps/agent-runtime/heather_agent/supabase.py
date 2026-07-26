from datetime import datetime
from urllib.parse import quote
from hashlib import sha256
import httpx
from .config import Settings
from .models import ExecutionContext, MemoryItem, MemoryPage, RunStatus, SkillRunResponse


class SupabaseGateway:
    def __init__(self, settings: Settings):
        self.settings = settings

    def headers(self, context: ExecutionContext) -> dict[str, str]:
        return {"apikey": self.settings.supabase_anon_key, "Authorization": f"Bearer {context.access_token}", "Content-Type": "application/json"}

    async def list_personal_memories(self, context: ExecutionContext, limit: int, cursor: str | None = None) -> MemoryPage:
        limit = min(max(limit, 1), self.settings.agent_max_memories)
        filters = ["archived=eq.false", "order=updated_at.desc,id.desc", f"limit={limit}", "select=id,content,title,summary,updated_at"]
        if cursor:
            filters.append(f"updated_at=lt.{quote(cursor, safe=':-TZ.+')}")
        url = f"{self.settings.supabase_url.rstrip('/')}/rest/v1/personal_memories?{'&'.join(filters)}"
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, headers={**self.headers(context), "Prefer": "count=exact"})
        response.raise_for_status()
        rows = response.json()
        items = [MemoryItem.model_validate(row) for row in rows]
        total = parse_count(response.headers.get("content-range"))
        return MemoryPage(items=items, total=total, next_cursor=items[-1].updated_at.isoformat() if len(items) == limit else None)

    async def create_run(self, context: ExecutionContext, skill_id: str, version: str) -> str:
        payload = {"user_id": context.user_id, "skill_id": skill_id, "skill_version": version, "status": RunStatus.QUEUED, "scope": "personal", "input_metadata": {"locale": context.locale}, "output_metadata": {}}
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(f"{self.settings.supabase_url.rstrip('/')}/rest/v1/skill_runs", headers={**self.headers(context), "Prefer": "return=representation"}, json=payload)
        response.raise_for_status()
        return str(response.json()[0]["id"])

    async def update_run(self, context: ExecutionContext, run_id: str, status: RunStatus, output_metadata: dict | None = None, error_code: str | None = None) -> None:
        payload = {"status": status, "output_metadata": output_metadata or {}, "error_code": error_code}
        if status == RunStatus.RUNNING:
            payload["started_at"] = datetime.utcnow().isoformat() + "Z"
        if status in {RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED}:
            payload["completed_at"] = datetime.utcnow().isoformat() + "Z"
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.patch(f"{self.settings.supabase_url.rstrip('/')}/rest/v1/skill_runs?id=eq.{run_id}", headers={**self.headers(context), "Prefer": "return=minimal"}, json=payload)
        response.raise_for_status()

    async def step(self, context: ExecutionContext, run_id: str, index: int, tool_name: str, status: RunStatus, input_summary: dict, output_summary: dict | None = None, error_code: str | None = None) -> None:
        payload = {"skill_run_id": run_id, "step_index": index, "tool_name": tool_name, "status": status, "input_summary": input_summary, "output_summary": output_summary or {}, "error_code": error_code}
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(f"{self.settings.supabase_url.rstrip('/')}/rest/v1/skill_run_steps", headers={**self.headers(context), "Prefer": "return=minimal"}, json=payload)
        response.raise_for_status()

    async def get_run(self, context: ExecutionContext, run_id: str) -> SkillRunResponse:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{self.settings.supabase_url.rstrip('/')}/rest/v1/skill_runs?id=eq.{run_id}&select=id,status,skill_id,output_metadata,error_code", headers=self.headers(context))
        response.raise_for_status()
        rows = response.json()
        if not rows:
            raise LookupError("Skill run not found.")
        row = rows[0]
        result = row.get("output_metadata", {}).get("result") if isinstance(row.get("output_metadata"), dict) else None
        return SkillRunResponse(run_id=str(row["id"]), status=RunStatus(row["status"]), skill_id=str(row["skill_id"]), result=result, error_code=row.get("error_code"))

    async def validate_research_scope(self, context: ExecutionContext, scope: str, team_id: str | None, project_id: str | None) -> None:
        if scope == "private":
            if team_id or project_id:
                raise PermissionError("invalid_private_scope")
            return
        if not team_id or not project_id:
            raise PermissionError("team_and_project_required")
        url = f"{self.settings.supabase_url.rstrip('/')}/rest/v1/research_projects?id=eq.{quote(project_id)}&team_id=eq.{quote(team_id)}&select=id"
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, headers=self.headers(context))
        response.raise_for_status()
        if not response.json():
            raise PermissionError("research_scope_denied")

    async def log_research_search(self, context: ExecutionContext, scope: str, team_id: str | None, project_id: str | None, provider: str, query: str, result_count: int) -> None:
        payload = {"user_id": context.user_id, "scope": scope, "team_id": team_id if scope == "team" else None, "project_id": project_id if scope == "team" else None, "provider": provider, "query_hash": sha256(query.encode()).hexdigest(), "result_count": result_count}
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(f"{self.settings.supabase_url.rstrip('/')}/rest/v1/research_search_runs", headers={**self.headers(context), "Prefer": "return=minimal"}, json=payload)
        response.raise_for_status()


def parse_count(content_range: str | None) -> int:
    try:
        return int((content_range or "*/0").split("/")[-1])
    except ValueError:
        return 0
