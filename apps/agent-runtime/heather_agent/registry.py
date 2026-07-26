from .models import SkillDefinition, ToolDefinition

PERSONAL_MEMORY_SUMMARY = SkillDefinition(
    id="personal_memory_summary",
    version="1.0.0",
    name="Personal memory summary",
    description="Summarize only the authenticated user's active personal memories.",
    scope="personal",
    risk_level="low",
    required_tools=["list_personal_memories", "summarize_personal_memories", "validate_personal_memory_summary"],
    required_permissions=["personal_memories:read"],
    input_schema={"type": "object", "additionalProperties": False},
    output_schema={"type": "object", "required": ["overview", "themes", "source_count"]},
    requires_approval=False,
    enabled=True,
)

SKILLS = {PERSONAL_MEMORY_SUMMARY.id: PERSONAL_MEMORY_SUMMARY}
TOOLS = {
    "list_personal_memories": ToolDefinition(name="list_personal_memories", description="Read the current user's active personal memories.", input_schema={"cursor": "optional", "limit": "1..100"}, output_schema={"items": "MemoryItem[]", "total": "integer", "next_cursor": "optional"}, required_permissions=["personal_memories:read"], timeout_seconds=10),
    "summarize_personal_memories": ToolDefinition(name="summarize_personal_memories", description="Produce a structured summary from a bounded memory page.", input_schema={"items": "MemoryItem[]"}, output_schema={"overview": "string", "themes": "SummaryTheme[]"}, required_permissions=["personal_memories:read"], timeout_seconds=35),
    "validate_personal_memory_summary": ToolDefinition(name="validate_personal_memory_summary", description="Validate summaries against the retrieved memory set.", input_schema={"summary": "PersonalMemorySummary", "items": "MemoryItem[]"}, output_schema={"valid": "boolean"}, required_permissions=["personal_memories:read"], timeout_seconds=5),
}

