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

    async def create_production_experiment(self, context: ExecutionContext, instruction: str, plan: dict, title: str) -> dict:
        payload = {"user_id": context.user_id, "title": title, "original_instruction": instruction, "parsed_plan": plan, "objective": plan["objective"], "profile_id": plan["profile_id"], "model_version": "phase9-simulation-1.0.0", "random_seed": plan["random_seed"], "status": "ready"}
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(f"{self.settings.supabase_url.rstrip('/')}/rest/v1/production_experiments", headers={**self.headers(context), "Prefer": "return=representation"}, json=payload)
        response.raise_for_status()
        return response.json()[0]

    async def get_production_experiment(self, context: ExecutionContext, experiment_id: str) -> dict:
        url = f"{self.settings.supabase_url.rstrip('/')}/rest/v1/production_experiments?id=eq.{quote(experiment_id)}&select=*"
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(url, headers=self.headers(context))
        response.raise_for_status()
        rows = response.json()
        if not rows:
            raise LookupError("production_experiment_not_found")
        return rows[0]

    async def list_production_experiments(self, context: ExecutionContext, limit: int = 25) -> list[dict]:
        url = f"{self.settings.supabase_url.rstrip('/')}/rest/v1/production_experiments?select=id,title,objective,profile_id,status,final_result,recommended_harvest_hour,created_at,completed_at&order=created_at.desc&limit={min(max(limit, 1), 50)}"
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(url, headers=self.headers(context))
        response.raise_for_status()
        return response.json()

    async def complete_production_experiment(self, context: ExecutionContext, experiment_id: str, result: dict) -> None:
        payload = {"status": "completed", "final_result": result, "recommended_harvest_hour": result["recommended_harvest_hour"], "started_at": datetime.utcnow().isoformat() + "Z", "completed_at": datetime.utcnow().isoformat() + "Z"}
        base = self.settings.supabase_url.rstrip('/')
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.patch(f"{base}/rest/v1/production_experiments?id=eq.{quote(experiment_id)}", headers={**self.headers(context), "Prefer": "return=minimal"}, json=payload)
            response.raise_for_status()
            points = [{"experiment_id": experiment_id, "time_h": point["time_h"], "phase": point["phase"], "measurements": point} for point in result["time_series"]]
            if points:
                response = await client.post(f"{base}/rest/v1/production_experiment_timepoints", headers={**self.headers(context), "Prefer": "return=minimal"}, json=points)
                response.raise_for_status()
            events = [{"experiment_id": experiment_id, "time_h": event["time_h"], "event_type": event["event_type"], "severity": event["severity"], "message": event["message"], "payload": event} for event in result["events"]]
            if events:
                response = await client.post(f"{base}/rest/v1/production_experiment_events", headers={**self.headers(context), "Prefer": "return=minimal"}, json=events)
                response.raise_for_status()
            analysis = result["analysis"][0]
            response = await client.post(f"{base}/rest/v1/production_experiment_analyses", headers={**self.headers(context), "Prefer": "return=minimal"}, json={"experiment_id": experiment_id, "analysis_type": "simulation_summary", "content": analysis, "evidence_level": analysis["evidence_level"], "confidence": analysis["confidence"]})
            response.raise_for_status()
            memory = result["memory_candidate"]
            response = await client.post(f"{base}/rest/v1/production_memory_candidates", headers={**self.headers(context), "Prefer": "return=minimal"}, json={"experiment_id": experiment_id, "user_id": context.user_id, "content": memory["content"], "structured_content": memory, "confidence": result["confidence"], "status": "suggested"})
            response.raise_for_status()


def parse_count(content_range: str | None) -> int:
    try:
        return int((content_range or "*/0").split("/")[-1])
    except ValueError:
        return 0
