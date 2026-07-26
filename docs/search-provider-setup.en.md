# Heather Search Provider Setup

Heather uses a free-first, allowlisted search layer. It never uses a paid fallback unless both `SEARCH_PAID_FALLBACK_ENABLED` and `SEARCH_ALLOW_PAID_PROVIDER` are explicitly set to `true`; the supplied defaults keep both `false`.

## Personal web search

Run a private SearXNG instance and set `SEARXNG_URL` to its internal HTTPS URL. If the instance requires one, set `SEARXNG_INTERNAL_TOKEN`. Heather requests only SearXNG JSON results. Do not configure a public shared SearXNG endpoint for production.

## Academic discovery

OpenAlex, Crossref, PubMed, and Europe PMC are free sources. OpenAlex is the normal general academic index and Europe PMC is selected for biomedical terms. Crossref is used only when OpenAlex has no result. PubMed, Unpaywall, and Semantic Scholar are implemented adapters for explicit or future allowlisted routing; missing optional keys leave them unavailable or rate-limited, never silently replaced by a paid provider.

Set `CROSSREF_MAILTO` and a descriptive `CROSSREF_USER_AGENT`. Set `NCBI_CONTACT_EMAIL` and optionally `NCBI_API_KEY` for PubMed. Set `UNPAYWALL_EMAIL` only if DOI open-access lookup is enabled. `SEMANTIC_SCHOLAR_API_KEY` is optional and without it the provider must be treated as low-rate.

## Deploying

1. Apply `supabase/migrations/007_phase4_search_discovery.sql` in the Supabase SQL editor.
2. Add the environment values to the separately deployed Agent Runtime, not to `NEXT_PUBLIC_*` Vercel values.
3. Set `AGENT_RUNTIME_URL` in the web deployment only after the runtime `/health` endpoint is reachable over HTTPS.
4. Sign in to Heather, then use an explicit search request. Direct Commands still take priority.

Search results are candidates only. Heather never saves them into memory or materials automatically.
