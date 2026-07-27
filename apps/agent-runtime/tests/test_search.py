import asyncio

from heather_agent.config import Settings
from heather_agent.models import ExecutionContext
from heather_agent.search import ResearchSource, SearchCache, SearchWorkflow, is_configured_searxng_url, safe_http_url


def settings() -> Settings:
    return Settings.model_construct(
        supabase_url="https://example.supabase.co",
        supabase_anon_key="anon",
        search_cache_ttl_seconds=900,
        search_negative_cache_ttl_seconds=60,
        nvidia_api_key=None,
        nvidia_model_general=None,
    )


def context() -> ExecutionContext:
    return ExecutionContext(user_id="user", access_token="token", permissions=set(), request_id="test", locale="ko", research_scope="personal")


def test_result_urls_reject_private_networks() -> None:
    assert not safe_http_url("http://127.0.0.1:8080")
    assert not safe_http_url("http://169.254.169.254/latest/meta-data")
    assert safe_http_url("https://www.jbnu.ac.kr/")


def test_operator_searxng_allows_loopback_only_for_configured_service() -> None:
    assert is_configured_searxng_url("http://127.0.0.1:8080")
    assert not is_configured_searxng_url("file:///tmp/search")


def test_search_cache_reuses_same_scope_and_keeps_paid_calls_zero() -> None:
    async def run() -> None:
        workflow = SearchWorkflow(settings(), SearchCache(settings()))

        async def fake_search(query: str, official_only: bool = False) -> list[ResearchSource]:
            return [ResearchSource(canonical_id="url:https://example.com", source_type="web", title=query, url="https://example.com", authors=[], provider_name="searxng")]

        workflow.searxng.search = fake_search  # type: ignore[method-assign]
        first = await workflow.execute(context(), "general_web_search", "test query")
        second = await workflow.execute(context(), "general_web_search", "test query")
        assert first["cached"] is False
        assert second["cached"] is True
        assert second["paid_api_calls"] == 0
        assert second["sources"][0]["provider"] == "searxng"

    asyncio.run(run())
