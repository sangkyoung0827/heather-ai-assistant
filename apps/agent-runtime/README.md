# Heather Agent Runtime

Python 3.12 FastAPI service for allowlisted Heather Skills. It is intentionally separate from the Next.js/Vercel application.

## Run locally

```bash
cp .env.example .env
python3.12 -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
uvicorn heather_agent.main:app --reload --port 8080
```

`POST /v1/skills/route` and `POST /v1/skills/execute` require `Authorization: Bearer <Supabase access token>`. The runtime validates that token through Supabase Auth and uses the same token for RLS-protected database access. It never accepts a caller-provided user ID, tool name, model name, or prompt.

## Container

```bash
docker build -t heather-agent-runtime .
docker run --env-file .env -p 8080:8080 heather-agent-runtime
```

