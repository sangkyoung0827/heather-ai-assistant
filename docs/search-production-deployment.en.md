# Heather Search Production Deployment

Heather never calls the Runtime from the browser. Vercel's `/api/intent/resolve` forwards the signed-in user's Bearer token and a server-only internal token to the Runtime, which calls private SearXNG and academic providers.

## 1. Deploy services

1. Create an `agent-runtime` service on Railway (or an equivalent container host), with Root Directory `apps/agent-runtime`.
2. Create a `searxng` service in the same project, with Root Directory `infra/searxng`. Keep it private.
3. Create a public HTTPS domain only for `agent-runtime`.
4. Set Runtime `SEARXNG_URL` to the platform private DNS and port, such as `http://searxng.railway.internal:8080`.

## 2. Environment variables

Runtime requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AGENT_RUNTIME_INTERNAL_TOKEN`, `NVIDIA_API_KEY`, `NVIDIA_API_BASE_URL`, `NVIDIA_MODEL_GENERAL`, `SEARXNG_URL`, optional `SEARXNG_INTERNAL_TOKEN`, and the configured academic-provider variables. Keep `SEARCH_PAID_FALLBACK_ENABLED=false` and `SEARCH_ALLOW_PAID_PROVIDER=false`.

Set SearXNG `SEARXNG_SECRET_KEY` from `openssl rand -hex 32`; let the host inject `PORT`. Set only `AGENT_RUNTIME_URL` and the identical `AGENT_RUNTIME_INTERNAL_TOKEN` in Vercel. Never use `NEXT_PUBLIC_*` for either a Runtime URL or secret.

## 3. Verify and troubleshoot

1. Run `curl -s https://<runtime-domain>/health` externally and check that `providers.searxng.status` is `configured`.
2. Save Vercel variables and redeploy Production.
3. Sign into Heather, then try a general and academic search.
4. Confirm the answer and cited titles/URLs. Existing LLM fallback is used only if Runtime is unavailable.

If SearXNG is not configured, check the Runtime's private DNS/port and the SearXNG container status first. Before public launch rotate any potentially exposed Supabase session, API, internal, and SearXNG keys; never put secret values in logs, docs, or commits.
