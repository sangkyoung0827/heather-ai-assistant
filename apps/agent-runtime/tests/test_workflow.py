from datetime import datetime, timezone
import pytest
from heather_agent.config import Settings
from heather_agent.models import MemoryItem, PersonalMemorySummary, SummaryTheme
from heather_agent.workflow import PersonalMemorySummaryWorkflow, SkillExecutionError, batch_memories


def memory(identifier: str, content: str = "A saved note") -> MemoryItem:
    return MemoryItem(id=identifier, content=content, updated_at=datetime.now(timezone.utc))


def workflow() -> PersonalMemorySummaryWorkflow:
    settings = Settings.model_construct(supabase_url="https://example.supabase.co", supabase_anon_key="anon")
    return PersonalMemorySummaryWorkflow(settings, gateway=None)  # type: ignore[arg-type]


def test_batches_large_memory_sets() -> None:
    batches = list(batch_memories([memory("a", "a" * 20), memory("b", "b" * 20), memory("c", "c" * 20)], 35))
    assert [[item.id for item in batch] for batch in batches] == [["a"], ["b"], ["c"]]


def test_validator_allows_retrieved_memory_ids() -> None:
    items = [memory("a"), memory("b")]
    summary = PersonalMemorySummary(overview="Saved notes are available.", themes=[SummaryTheme(title="Notes", summary="Saved notes.", memory_ids=["a", "b"])], source_count=2)
    workflow()._validate(summary, items)


def test_validator_rejects_unknown_memory_ids() -> None:
    summary = PersonalMemorySummary(overview="Saved notes are available.", themes=[SummaryTheme(title="Notes", summary="Saved notes.", memory_ids=["other"])], source_count=1)
    with pytest.raises(SkillExecutionError, match="summary_validation_failed"):
        workflow()._validate(summary, [memory("a")])

