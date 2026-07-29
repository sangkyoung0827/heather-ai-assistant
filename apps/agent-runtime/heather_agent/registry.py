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
GENERAL_WEB_SEARCH = SkillDefinition(id="general_web_search", version="1.0.0", name="General web search", description="Search the public web through private SearXNG only.", scope="personal", risk_level="low", required_tools=["search_searxng"], required_permissions=["web_search:read"], input_schema={"query": "string"}, output_schema={"sources": "ResearchSource[]"}, requires_approval=False, enabled=True)
RESEARCH_ACADEMIC_DISCOVERY = SkillDefinition(id="research_academic_discovery", version="1.0.0", name="Research academic discovery", description="Find scholarly sources through selected free academic indexes.", scope="research", risk_level="low", required_tools=["search_academic_sources"], required_permissions=["research_search:read"], input_schema={"query": "string", "scope": "private|team"}, output_schema={"sources": "ResearchSource[]"}, requires_approval=False, enabled=True)
RESEARCH_WEB_DISCOVERY = SkillDefinition(id="research_web_discovery", version="1.0.0", name="Research official web discovery", description="Find official web sources through private SearXNG only.", scope="research", risk_level="low", required_tools=["search_searxng"], required_permissions=["research_search:read"], input_schema={"query": "string", "scope": "private|team"}, output_schema={"sources": "ResearchSource[]"}, requires_approval=False, enabled=True)
SKILLS.update({GENERAL_WEB_SEARCH.id: GENERAL_WEB_SEARCH, RESEARCH_ACADEMIC_DISCOVERY.id: RESEARCH_ACADEMIC_DISCOVERY, RESEARCH_WEB_DISCOVERY.id: RESEARCH_WEB_DISCOVERY})
PRODUCTION_SKILLS = [
    SkillDefinition(id="production_experiment_parse", version="1.0.0", name="Production experiment parse", description="Parse a research-only production simulation instruction.", scope="research", risk_level="low", required_tools=["production_plan_parser"], required_permissions=["research_search:read"], input_schema={"instruction": "string"}, output_schema={"plan": "ProductionExperimentPlan"}, requires_approval=False, enabled=True),
    SkillDefinition(id="production_experiment_simulate", version="1.0.0", name="Production experiment simulate", description="Run a deterministic research-only process simulation after approval.", scope="research", risk_level="medium", required_tools=["production_simulator"], required_permissions=["research_search:read"], input_schema={"experiment_id": "uuid"}, output_schema={"result": "ProductionSimulationResult"}, requires_approval=True, enabled=True),
    SkillDefinition(id="production_experiment_analyze", version="1.0.0", name="Production experiment analyze", description="Analyze simulated output without physical causality claims.", scope="research", risk_level="low", required_tools=["production_analyzer"], required_permissions=["research_search:read"], input_schema={"experiment_id": "uuid"}, output_schema={"analysis": "object"}, requires_approval=False, enabled=True),
    SkillDefinition(id="production_experiment_compare", version="1.0.0", name="Production experiment compare", description="Compare user-owned simulations.", scope="research", risk_level="low", required_tools=["production_comparator"], required_permissions=["research_search:read"], input_schema={"experiment_ids": "uuid[]"}, output_schema={"comparison": "object"}, requires_approval=False, enabled=True),
    SkillDefinition(id="production_experiment_recommend", version="1.0.0", name="Production experiment recommend", description="Suggest only user-approved follow-up candidates.", scope="research", risk_level="medium", required_tools=["production_recommender"], required_permissions=["research_search:read"], input_schema={"experiment_id": "uuid"}, output_schema={"recommendations": "object[]"}, requires_approval=True, enabled=True),
    SkillDefinition(id="production_literature_discovery", version="1.0.0", name="Production literature discovery", description="Discover literature relevant to a simulated process.", scope="research", risk_level="low", required_tools=["search_academic_sources"], required_permissions=["research_search:read"], input_schema={"experiment_id": "uuid"}, output_schema={"sources": "ResearchSource[]"}, requires_approval=False, enabled=True),
]
SKILLS.update({skill.id: skill for skill in PRODUCTION_SKILLS})
TOOLS = {
    "list_personal_memories": ToolDefinition(name="list_personal_memories", description="Read the current user's active personal memories.", input_schema={"cursor": "optional", "limit": "1..100"}, output_schema={"items": "MemoryItem[]", "total": "integer", "next_cursor": "optional"}, required_permissions=["personal_memories:read"], timeout_seconds=10),
    "summarize_personal_memories": ToolDefinition(name="summarize_personal_memories", description="Produce a structured summary from a bounded memory page.", input_schema={"items": "MemoryItem[]"}, output_schema={"overview": "string", "themes": "SummaryTheme[]"}, required_permissions=["personal_memories:read"], timeout_seconds=35),
    "validate_personal_memory_summary": ToolDefinition(name="validate_personal_memory_summary", description="Validate summaries against the retrieved memory set.", input_schema={"summary": "PersonalMemorySummary", "items": "MemoryItem[]"}, output_schema={"valid": "boolean"}, required_permissions=["personal_memories:read"], timeout_seconds=5),
    "search_searxng": ToolDefinition(name="search_searxng", description="Query a private SearXNG endpoint with a bounded public query.", input_schema={"query": "string"}, output_schema={"sources": "ResearchSource[]"}, required_permissions=["web_search:read"], timeout_seconds=12),
    "search_academic_sources": ToolDefinition(name="search_academic_sources", description="Query one selected academic source provider at a time.", input_schema={"query": "string"}, output_schema={"sources": "ResearchSource[]"}, required_permissions=["research_search:read"], timeout_seconds=20),
    "production_plan_parser": ToolDefinition(name="production_plan_parser", description="Validate a bounded natural-language plan against a profile envelope.", input_schema={"instruction": "string"}, output_schema={"plan": "ProductionExperimentPlan"}, required_permissions=["research_search:read"], timeout_seconds=5),
    "production_simulator": ToolDefinition(name="production_simulator", description="Run deterministic research-only mass-balance-inspired simulation steps.", input_schema={"plan": "ProductionExperimentPlan"}, output_schema={"result": "ProductionSimulationResult"}, required_permissions=["research_search:read"], timeout_seconds=15),
    "production_analyzer": ToolDefinition(name="production_analyzer", description="Summarize a simulation with stated limitations.", input_schema={"result": "ProductionSimulationResult"}, output_schema={"analysis": "object"}, required_permissions=["research_search:read"], timeout_seconds=5),
    "production_comparator": ToolDefinition(name="production_comparator", description="Compare at most four owned simulation results.", input_schema={"experiments": "object[]"}, output_schema={"comparison": "object"}, required_permissions=["research_search:read"], timeout_seconds=5),
    "production_recommender": ToolDefinition(name="production_recommender", description="Generate three user-approved simulation candidates.", input_schema={"result": "ProductionSimulationResult"}, output_schema={"recommendations": "object[]"}, required_permissions=["research_search:read"], timeout_seconds=5),
}
