from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_anon_key: str
    agent_runtime_internal_token: str | None = None
    nvidia_api_key: str | None = None
    nvidia_api_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_memory_summary_model: str | None = None
    nvidia_model_general: str | None = None
    agent_max_memories: int = 100
    agent_memory_batch_chars: int = 12000
    agent_nvidia_timeout_seconds: int = 30
    search_paid_fallback_enabled: bool = False
    search_allow_paid_provider: bool = False
    searxng_url: str | None = None
    searxng_internal_token: str | None = None
    openalex_api_key: str | None = None
    openalex_allow_paid_content: bool = False
    crossref_mailto: str | None = None
    crossref_user_agent: str = "Heather-Agent-Runtime/0.1 (research discovery)"
    ncbi_api_key: str | None = None
    ncbi_tool: str = "heather_ai_assistant"
    ncbi_contact_email: str | None = None
    europe_pmc_base_url: str = "https://www.ebi.ac.uk/europepmc/webservices/rest"
    unpaywall_email: str | None = None
    semantic_scholar_api_key: str | None = None
    search_timeout_seconds: int = 10
    search_cache_ttl_seconds: int = 900
    search_negative_cache_ttl_seconds: int = 60

    @property
    def summary_model(self) -> str | None:
        return self.nvidia_memory_summary_model or self.nvidia_model_general
