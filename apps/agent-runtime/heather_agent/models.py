from datetime import datetime
from enum import StrEnum
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ExecutionContext(BaseModel):
    model_config = ConfigDict(frozen=True)
    user_id: str
    access_token: str = Field(repr=False)
    permissions: set[str]
    request_id: str
    locale: Literal["ko", "en"] = "ko"
    research_scope: str | None = None
    team_id: str | None = None
    project_id: str | None = None


class SkillDefinition(BaseModel):
    id: str
    version: str
    name: str
    description: str
    scope: Literal["personal", "research"]
    risk_level: Literal["low", "medium", "high", "critical"]
    required_tools: list[str]
    required_permissions: list[str]
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    requires_approval: bool
    enabled: bool


class ToolDefinition(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    required_permissions: list[str]
    timeout_seconds: int


class RouteRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1200)
    locale: Literal["ko", "en"] = "ko"
    space: Literal["personal", "research"] = "personal"
    research_scope: Literal["private", "team"] = "private"
    team_id: str | None = None
    project_id: str | None = None


class RouteResponse(BaseModel):
    skill_id: str | None = None
    confidence: float = Field(ge=0, le=1)
    reason: str


class ExecuteRequest(BaseModel):
    skill_id: Literal["personal_memory_summary", "general_web_search", "research_academic_discovery", "research_web_discovery"]
    locale: Literal["ko", "en"] = "ko"
    max_memories: int | None = Field(default=None, ge=1, le=100)
    query: str | None = Field(default=None, max_length=1200)
    research_scope: Literal["private", "team"] = "private"
    team_id: str | None = None
    project_id: str | None = None


class MemoryItem(BaseModel):
    id: str
    content: str
    title: str | None = None
    summary: str | None = None
    updated_at: datetime


class MemoryPage(BaseModel):
    items: list[MemoryItem]
    total: int
    next_cursor: str | None = None


class SummaryTheme(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=1200)
    memory_ids: list[str] = Field(min_length=1, max_length=50)


class PersonalMemorySummary(BaseModel):
    overview: str = Field(max_length=1600)
    themes: list[SummaryTheme] = Field(max_length=12)
    source_count: int = Field(ge=0)


class SkillRunResponse(BaseModel):
    run_id: str
    status: RunStatus
    skill_id: str
    result: Any | None = None
    error_code: str | None = None
