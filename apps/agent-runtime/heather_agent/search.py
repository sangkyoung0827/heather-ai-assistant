"""Allowlisted, free-first discovery tools. External page content is never executed or trusted."""

import asyncio
import hashlib
import ipaddress
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from time import monotonic
from urllib.parse import urlparse

import httpx

from .config import Settings
from .models import ExecutionContext


@dataclass(frozen=True)
class ResearchSource:
    canonical_id: str
    source_type: str
    title: str
    url: str
    authors: list[str]
    year: int | None = None
    abstract: str | None = None
    doi: str | None = None
    pmid: str | None = None
    pmcid: str | None = None
    openalex_id: str | None = None
    verification_level: str = "metadata_only"

    def public(self) -> dict:
        return {"id": self.canonical_id, "type": self.source_type, "title": self.title, "url": self.url, "authors": self.authors[:4], "year": self.year, "doi": self.doi, "pmid": self.pmid, "pmcid": self.pmcid, "verification": self.verification_level}


class SearchCache:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.items: dict[str, tuple[float, list[ResearchSource]]] = {}
        self.inflight: dict[str, asyncio.Task[list[ResearchSource]]] = {}

    async def get_or_create(self, key: str, producer: Callable[[], Awaitable[list[ResearchSource]]]) -> tuple[list[ResearchSource], bool]:
        current = self.items.get(key)
        if current and current[0] > monotonic():
            return current[1], True
        task = self.inflight.get(key)
        if task is None:
            task = asyncio.create_task(producer())
            self.inflight[key] = task
        try:
            sources = await task
            ttl = self.settings.search_cache_ttl_seconds if sources else self.settings.search_negative_cache_ttl_seconds
            self.items[key] = (monotonic() + ttl, sources)
            return sources, False
        finally:
            if self.inflight.get(key) is task:
                self.inflight.pop(key, None)


def safe_http_url(value: str) -> bool:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    host = parsed.hostname.casefold()
    if host in {"localhost", "localhost.localdomain", "metadata.google.internal"} or host.endswith(".local"):
        return False
    try:
        return not ipaddress.ip_address(host).is_private and not ipaddress.ip_address(host).is_loopback and not ipaddress.ip_address(host).is_link_local
    except ValueError:
        return True


class ProviderError(Exception):
    pass


class BaseProvider:
    name = "base"

    def __init__(self, settings: Settings):
        self.settings = settings

    async def health_check(self) -> bool:
        return self.enabled

    @property
    def enabled(self) -> bool:
        return True

    async def get_quota_status(self) -> dict[str, str]:
        return {"provider": self.name, "mode": "free", "status": "available" if self.enabled else "not_configured"}


class SearxngProvider(BaseProvider):
    name = "searxng"

    @property
    def enabled(self) -> bool:
        return bool(self.settings.searxng_url and safe_http_url(self.settings.searxng_url))

    async def search(self, query: str, official_only: bool = False) -> list[ResearchSource]:
        if not self.enabled:
            raise ProviderError("searxng_not_configured")
        headers = {"X-Internal-Token": self.settings.searxng_internal_token} if self.settings.searxng_internal_token else {}
        async with httpx.AsyncClient(timeout=self.settings.search_timeout_seconds, follow_redirects=False) as client:
            response = await client.get(f"{self.settings.searxng_url.rstrip('/')}/search", params={"q": query, "format": "json", "language": "all"}, headers=headers)
        if response.status_code == 429:
            raise ProviderError("searxng_rate_limited")
        response.raise_for_status()
        results = response.json().get("results", [])[:8]
        output: list[ResearchSource] = []
        for row in results:
            url = str(row.get("url") or "")
            if not safe_http_url(url):
                continue
            title = clean(str(row.get("title") or url))
            if official_only and not is_official(url, title):
                continue
            output.append(ResearchSource(canonical_id=f"url:{normalize_url(url)}", source_type="web", title=title[:400], url=url, authors=[], abstract=clean(str(row.get("content") or ""))[:1200] or None, verification_level="snippet_only"))
        return dedupe(output)


class OpenAlexProvider(BaseProvider):
    name = "openalex"

    async def search(self, query: str) -> list[ResearchSource]:
        params = {"search": query, "per-page": 10, "select": "id,display_name,doi,publication_year,authorships,primary_location,abstract_inverted_index,open_access"}
        if self.settings.openalex_api_key:
            params["api_key"] = self.settings.openalex_api_key
        async with httpx.AsyncClient(timeout=self.settings.search_timeout_seconds) as client:
            response = await client.get("https://api.openalex.org/works", params=params)
        response.raise_for_status()
        output: list[ResearchSource] = []
        for row in response.json().get("results", []):
            if not self.settings.openalex_allow_paid_content and not row.get("open_access", {}).get("is_oa"):
                continue
            doi = clean(str(row.get("doi") or "")).removeprefix("https://doi.org/") or None
            location = row.get("primary_location") or {}
            url = str((location.get("landing_page_url") or row.get("doi") or row.get("id") or ""))
            if not safe_http_url(url):
                continue
            authors = [clean(str(item.get("author", {}).get("display_name") or "")) for item in row.get("authorships", [])][:8]
            output.append(ResearchSource(canonical_id=f"openalex:{row['id']}", source_type="article", title=clean(str(row.get("display_name") or "Untitled")), url=url, authors=[item for item in authors if item], year=row.get("publication_year"), abstract=inverted_abstract(row.get("abstract_inverted_index")), doi=doi, openalex_id=str(row.get("id")), verification_level="metadata_and_abstract" if row.get("abstract_inverted_index") else "metadata_only"))
        return dedupe(output)


class CrossrefProvider(BaseProvider):
    name = "crossref"

    async def search(self, query: str) -> list[ResearchSource]:
        headers = {"User-Agent": self.settings.crossref_user_agent}
        params = {"query": query, "rows": 10}
        if self.settings.crossref_mailto:
            params["mailto"] = self.settings.crossref_mailto
        async with httpx.AsyncClient(timeout=self.settings.search_timeout_seconds) as client:
            response = await client.get("https://api.crossref.org/works", params=params, headers=headers)
        response.raise_for_status()
        output = []
        for row in response.json().get("message", {}).get("items", []):
            doi = str(row.get("DOI") or "") or None
            url = f"https://doi.org/{doi}" if doi else str(row.get("URL") or "")
            if not safe_http_url(url):
                continue
            title = clean(" ".join(row.get("title") or [])) or "Untitled"
            authors = [clean(f"{x.get('given', '')} {x.get('family', '')}") for x in row.get("author", [])]
            year = next(iter(row.get("published", {}).get("date-parts", [[]])[0]), None)
            output.append(ResearchSource(canonical_id=f"doi:{doi.casefold()}" if doi else f"url:{normalize_url(url)}", source_type="article", title=title, url=url, authors=[x for x in authors if x], year=year, doi=doi, verification_level="metadata_only"))
        return dedupe(output)


class EuropePmcProvider(BaseProvider):
    name = "europe_pmc"

    async def search(self, query: str) -> list[ResearchSource]:
        async with httpx.AsyncClient(timeout=self.settings.search_timeout_seconds) as client:
            response = await client.get(f"{self.settings.europe_pmc_base_url.rstrip('/')}/search", params={"query": query, "format": "json", "pageSize": 10})
        response.raise_for_status()
        output = []
        for row in response.json().get("resultList", {}).get("result", []):
            pmid, pmcid, doi = row.get("pmid"), row.get("pmcid"), row.get("doi")
            url = f"https://europepmc.org/article/{row.get('source', 'MED')}/{row.get('id')}"
            output.append(ResearchSource(canonical_id=f"pmid:{pmid}" if pmid else f"pmcid:{pmcid}" if pmcid else f"url:{normalize_url(url)}", source_type="article", title=clean(str(row.get("title") or "Untitled")), url=url, authors=clean(str(row.get("authorString") or "")).split(", ")[:8], year=parse_year(row.get("pubYear")), abstract=clean(str(row.get("abstractText") or "")) or None, doi=doi, pmid=pmid, pmcid=pmcid, verification_level="metadata_and_abstract" if row.get("abstractText") else "metadata_only"))
        return dedupe(output)


class PubMedProvider(BaseProvider):
    """NCBI E-utilities adapter. It is selected only for explicit PubMed requests."""
    name = "pubmed"

    async def search(self, query: str) -> list[ResearchSource]:
        params = {"db": "pubmed", "term": query, "retmode": "json", "retmax": 10, "tool": self.settings.ncbi_tool}
        if self.settings.ncbi_api_key:
            params["api_key"] = self.settings.ncbi_api_key
        if self.settings.ncbi_contact_email:
            params["email"] = self.settings.ncbi_contact_email
        async with httpx.AsyncClient(timeout=self.settings.search_timeout_seconds) as client:
            ids_response = await client.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", params=params)
            ids_response.raise_for_status()
            ids = ids_response.json().get("esearchresult", {}).get("idlist", [])
            if not ids:
                return []
            summary_response = await client.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi", params={**params, "id": ",".join(ids)})
        summary_response.raise_for_status()
        rows = summary_response.json().get("result", {})
        return [ResearchSource(canonical_id=f"pmid:{identifier}", source_type="article", title=clean(str(rows[identifier].get("title") or "Untitled")), url=f"https://pubmed.ncbi.nlm.nih.gov/{identifier}/", authors=[clean(str(author.get("name") or "")) for author in rows[identifier].get("authors", [])], year=parse_year(rows[identifier].get("pubdate")), pmid=identifier, verification_level="metadata_only") for identifier in ids if identifier in rows]


class UnpaywallProvider(BaseProvider):
    name = "unpaywall"

    @property
    def enabled(self) -> bool:
        return bool(self.settings.unpaywall_email)

    async def fetch_by_doi(self, doi: str) -> ResearchSource | None:
        if not self.enabled:
            return None
        async with httpx.AsyncClient(timeout=self.settings.search_timeout_seconds) as client:
            response = await client.get(f"https://api.unpaywall.org/v2/{doi}", params={"email": self.settings.unpaywall_email})
        if response.status_code == 404:
            return None
        response.raise_for_status()
        row, location = response.json(), response.json().get("best_oa_location") or {}
        url = str(location.get("url_for_pdf") or location.get("url") or "")
        return ResearchSource(canonical_id=f"doi:{doi.casefold()}", source_type="article", title=clean(str(row.get("title") or "Untitled")), url=url if safe_http_url(url) else f"https://doi.org/{doi}", authors=[], year=parse_year(row.get("year")), doi=doi, verification_level="open_access_location")


class SemanticScholarProvider(BaseProvider):
    name = "semantic_scholar"

    async def search(self, query: str) -> list[ResearchSource]:
        headers = {"x-api-key": self.settings.semantic_scholar_api_key} if self.settings.semantic_scholar_api_key else {}
        async with httpx.AsyncClient(timeout=self.settings.search_timeout_seconds) as client:
            response = await client.get("https://api.semanticscholar.org/graph/v1/paper/search", params={"query": query, "limit": 10, "fields": "title,year,authors,url,externalIds,abstract"}, headers=headers)
        response.raise_for_status()
        output = []
        for row in response.json().get("data", []):
            ids, url = row.get("externalIds") or {}, str(row.get("url") or "")
            if not safe_http_url(url):
                continue
            output.append(ResearchSource(canonical_id=f"semantic:{row.get('paperId')}", source_type="article", title=clean(str(row.get("title") or "Untitled")), url=url, authors=[clean(str(author.get("name") or "")) for author in row.get("authors", [])], year=row.get("year"), abstract=clean(str(row.get("abstract") or "")) or None, doi=ids.get("DOI"), pmid=ids.get("PubMed"), verification_level="metadata_and_abstract" if row.get("abstract") else "metadata_only"))
        return dedupe(output)


def choose_academic_provider(query: str) -> str:
    bio_terms = ("pubmed", "clinical", "medical", "medicine", "gene", "protein", "cancer", "disease", "biolog", "의학", "임상", "유전자", "단백질", "질병", "실험")
    return "europe_pmc" if any(term in query.casefold() for term in bio_terms) else "openalex"


def normalize_url(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc.casefold()}{parsed.path.rstrip('/')}".casefold()


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", value)).strip()


def parse_year(value: object) -> int | None:
    try:
        return int(str(value)[:4])
    except (TypeError, ValueError):
        return None


def inverted_abstract(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    words = sorted(((position, word) for word, positions in value.items() for position in positions), key=lambda item: item[0])
    return " ".join(word for _, word in words)[:5000] or None


def is_official(url: str, title: str) -> bool:
    host = urlparse(url).hostname or ""
    return host.endswith((".gov", ".edu", ".ac.uk", ".int")) or any(word in title.casefold() for word in ("official", "guideline", "report", "policy", "공식", "지침", "보고서"))


def dedupe(items: list[ResearchSource]) -> list[ResearchSource]:
    seen: set[str] = set()
    output = []
    for item in items:
        key = (item.doi or item.pmid or item.pmcid or item.openalex_id or item.canonical_id or hashlib.sha256(item.title.casefold().encode()).hexdigest()).casefold()
        if key not in seen:
            seen.add(key)
            output.append(item)
    return output


class SearchWorkflow:
    def __init__(self, settings: Settings, cache: SearchCache):
        self.settings, self.cache = settings, cache
        self.searxng, self.openalex, self.crossref, self.europe_pmc = SearxngProvider(settings), OpenAlexProvider(settings), CrossrefProvider(settings), EuropePmcProvider(settings)

    async def execute(self, context: ExecutionContext, skill_id: str, query: str) -> dict:
        query = clean(query)[:1200]
        if not query:
            raise ProviderError("query_required")
        if skill_id == "general_web_search":
            sources, cached = await self.cache.get_or_create(f"general:{query.casefold()}", lambda: self.searxng.search(query))
        elif skill_id == "research_web_discovery":
            sources, cached = await self.cache.get_or_create(f"official:{query.casefold()}", lambda: self.searxng.search(query, official_only=True))
        else:
            provider = self.europe_pmc if choose_academic_provider(query) == "europe_pmc" else self.openalex
            sources, cached = await self.cache.get_or_create(f"academic:{provider.name}:{query.casefold()}", lambda: provider.search(query))
            if not sources and provider.name == "openalex":
                sources, cached = await self.cache.get_or_create(f"academic:crossref:{query.casefold()}", lambda: self.crossref.search(query))
        return {"query": query, "sources": [source.public() for source in sources[:8]], "cached": cached, "provider": "searxng" if skill_id != "research_academic_discovery" else choose_academic_provider(query), "paid_api_calls": 0}
