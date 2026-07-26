from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_anon_key: str
    nvidia_api_key: str | None = None
    nvidia_api_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_memory_summary_model: str | None = None
    nvidia_model_general: str | None = None
    agent_max_memories: int = 100
    agent_memory_batch_chars: int = 12000
    agent_nvidia_timeout_seconds: int = 30

    @property
    def summary_model(self) -> str | None:
        return self.nvidia_memory_summary_model or self.nvidia_model_general

