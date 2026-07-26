# Heather Phase 4 Agent Runtime

`apps/agent-runtime` is a separately deployable Python 3.12 FastAPI service. It uses the production `nvidia-nat` NeMo Agent Toolkit package as its runtime dependency, while Heather's first workflow stays deterministic and sequential rather than allowing an LLM to choose tools.

## Request flow

1. General chat resolves a Direct Command first.
2. On a miss, Next.js calls the configured HTTPS Agent Runtime with the signed-in user's Supabase access token.
3. The runtime accepts only its server-defined `personal_memory_summary` skill at high router confidence.
4. It validates the token through Supabase Auth, derives `user_id`, then uses the same token for RLS-protected reads.
5. A fixed workflow lists active personal memories, batches them, calls the configured NVIDIA model, validates output, and records safe execution metadata.
6. A skill miss, unavailable runtime, or failed skill preserves the existing NVIDIA chat fallback.

## Safety

- The request body cannot choose a user ID, tool, model, system prompt, or custom skill.
- `list_personal_memories` is read-only, bounded to 100 items, excludes archived rows, and uses RLS.
- `skill_runs` and `skill_run_steps` retain counts, IDs, status, and error codes only. They do not copy full memory text or tokens.
- The NVIDIA request excludes access tokens, user IDs, permission data, and internal metadata.

## Required deployment configuration

Deploy `apps/agent-runtime` to a Docker-capable service, apply `supabase/migrations/006_phase4_skill_runs.sql`, then configure its `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NVIDIA_API_KEY`, and model environment variables. Set `AGENT_RUNTIME_URL` in Vercel Production to the runtime's HTTPS origin and redeploy the web app.

