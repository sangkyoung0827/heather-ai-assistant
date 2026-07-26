import asyncio
import json
import re
from collections.abc import Iterable
import httpx
from .config import Settings
from .models import ExecutionContext, MemoryItem, PersonalMemorySummary, RunStatus, SkillRunResponse
from .registry import PERSONAL_MEMORY_SUMMARY
from .supabase import SupabaseGateway


class SkillExecutionError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class PersonalMemorySummaryWorkflow:
    def __init__(self, settings: Settings, gateway: SupabaseGateway):
        self.settings = settings
        self.gateway = gateway

    async def execute(self, context: ExecutionContext, requested_limit: int | None = None) -> SkillRunResponse:
        if "personal_memories:read" not in context.permissions:
            raise SkillExecutionError("permission_denied")
        run_id = await self.gateway.create_run(context, PERSONAL_MEMORY_SUMMARY.id, PERSONAL_MEMORY_SUMMARY.version)
        try:
            await self.gateway.update_run(context, run_id, RunStatus.RUNNING)
            memories = await self._list(context, run_id, requested_limit)
            summary = await self._summarize(context, run_id, memories)
            self._validate(summary, memories)
            await self.gateway.step(context, run_id, 3, "validate_personal_memory_summary", RunStatus.COMPLETED, {"memory_count": len(memories)}, {"source_count": summary.source_count, "theme_count": len(summary.themes)})
            await self.gateway.update_run(context, run_id, RunStatus.COMPLETED, {"source_count": summary.source_count, "theme_count": len(summary.themes), "result": summary.model_dump()})
            return SkillRunResponse(run_id=run_id, status=RunStatus.COMPLETED, skill_id=PERSONAL_MEMORY_SUMMARY.id, result=summary)
        except SkillExecutionError as error:
            await self.gateway.update_run(context, run_id, RunStatus.FAILED, error_code=error.code)
            return SkillRunResponse(run_id=run_id, status=RunStatus.FAILED, skill_id=PERSONAL_MEMORY_SUMMARY.id, error_code=error.code)
        except Exception:
            await self.gateway.update_run(context, run_id, RunStatus.FAILED, error_code="execution_failed")
            return SkillRunResponse(run_id=run_id, status=RunStatus.FAILED, skill_id=PERSONAL_MEMORY_SUMMARY.id, error_code="execution_failed")

    async def _list(self, context: ExecutionContext, run_id: str, requested_limit: int | None) -> list[MemoryItem]:
        page = await self.gateway.list_personal_memories(context, min(requested_limit or self.settings.agent_max_memories, self.settings.agent_max_memories))
        await self.gateway.step(context, run_id, 1, "list_personal_memories", RunStatus.COMPLETED, {"archived": False}, {"count": len(page.items), "total": page.total})
        return page.items

    async def _summarize(self, context: ExecutionContext, run_id: str, memories: list[MemoryItem]) -> PersonalMemorySummary:
        if not memories:
            summary = PersonalMemorySummary(overview="저장된 개인 메모리가 없습니다." if context.locale == "ko" else "No active personal memories are available.", themes=[], source_count=0)
            await self.gateway.step(context, run_id, 2, "summarize_personal_memories", RunStatus.COMPLETED, {"memory_count": 0}, {"source_count": 0})
            return summary
        batches = list(batch_memories(memories, self.settings.agent_memory_batch_chars))
        summaries = [await self._nvidia_summary(batch, context.locale) for batch in batches]
        combined = combine_summaries(summaries, len(memories), context.locale)
        await self.gateway.step(context, run_id, 2, "summarize_personal_memories", RunStatus.COMPLETED, {"memory_count": len(memories), "batch_count": len(batches)}, {"source_count": combined.source_count, "theme_count": len(combined.themes)})
        return combined

    async def _nvidia_summary(self, memories: list[MemoryItem], locale: str) -> PersonalMemorySummary:
        if not self.settings.nvidia_api_key or not self.settings.summary_model:
            raise SkillExecutionError("nvidia_not_configured")
        source = [{"id": item.id, "title": item.title, "summary": item.summary, "content": item.content} for item in memories]
        prompt = "Return JSON only with overview, themes[{title,summary,memory_ids}], source_count. Cite only IDs provided. Do not invent dates, quantities, people, or facts. Use Korean." if locale == "ko" else "Return JSON only with overview, themes[{title,summary,memory_ids}], source_count. Cite only IDs provided. Do not invent dates, quantities, people, or facts. Use English."
        try:
            async with httpx.AsyncClient(timeout=self.settings.agent_nvidia_timeout_seconds) as client:
                response = await client.post(f"{self.settings.nvidia_api_base_url.rstrip('/')}/chat/completions", headers={"Authorization": f"Bearer {self.settings.nvidia_api_key}", "Content-Type": "application/json"}, json={"model": self.settings.summary_model, "temperature": 0.1, "max_tokens": 1000, "messages": [{"role": "system", "content": prompt}, {"role": "user", "content": json.dumps(source, ensure_ascii=False)}]})
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            return PersonalMemorySummary.model_validate(json.loads(strip_json_fence(content)))
        except asyncio.TimeoutError as error:
            raise SkillExecutionError("nvidia_timeout") from error
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise SkillExecutionError("nvidia_invalid_json") from error
        except httpx.HTTPError as error:
            raise SkillExecutionError("nvidia_request_failed") from error

    def _validate(self, summary: PersonalMemorySummary, memories: list[MemoryItem]) -> None:
        source_ids = {item.id for item in memories}
        if summary.source_count != len(memories) or any(memory_id not in source_ids for theme in summary.themes for memory_id in theme.memory_ids):
            raise SkillExecutionError("summary_validation_failed")
        source_text = " ".join(filter(None, [item.title or "" for item in memories] + [item.summary or "" for item in memories] + [item.content for item in memories]))
        output = summary.overview + " " + " ".join(theme.summary for theme in summary.themes)
        if len(output) > min(4000, max(600, len(source_text) * 0.65)):
            raise SkillExecutionError("summary_overexposure")
        source_numbers = set(re.findall(r"\d+(?:[./:-]\d+)*", source_text))
        if any(number not in source_numbers for number in re.findall(r"\d+(?:[./:-]\d+)*", output)):
            raise SkillExecutionError("summary_unsupported_detail")


def batch_memories(items: list[MemoryItem], max_chars: int) -> Iterable[list[MemoryItem]]:
    batch: list[MemoryItem] = []
    size = 0
    for item in items:
        item_size = len(item.content) + len(item.title or "") + len(item.summary or "")
        if batch and size + item_size > max_chars:
            yield batch
            batch, size = [], 0
        batch.append(item)
        size += item_size
    if batch:
        yield batch


def combine_summaries(summaries: list[PersonalMemorySummary], source_count: int, locale: str) -> PersonalMemorySummary:
    themes = [theme for summary in summaries for theme in summary.themes][:12]
    overview = " ".join(summary.overview for summary in summaries).strip()
    if not overview:
        overview = "개인 메모리를 요약했습니다." if locale == "ko" else "Personal memories were summarized."
    return PersonalMemorySummary(overview=overview[:1600], themes=themes, source_count=source_count)


def strip_json_fence(value: str) -> str:
    return value.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

