# Heather AI Assistant

Heather / 헤더 is a personal AI assistant web app designed as a PWA first and as a future Tauri or Electron desktop front end later.

The repository is split so browser UI, assistant reasoning, AI providers, database access, and platform capabilities stay separate:

- `apps/web`: Next.js App Router PWA.
- `packages/core`: Pure TypeScript assistant logic, persona, summaries, analysis, briefing, and safety policy.
- `packages/ai`: AI provider adapters. OpenAI is called only from the server route.
- `packages/db`: Repository interfaces plus browser-local storage for the phase 1 build.
- `packages/platform`: Web and future desktop platform adapters.

## Quick Start

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Environment

Heather is offline-first by default. The app will not call OpenAI just because an API key exists.

Create `.env.local` inside `apps/web` only when you explicitly want live OpenAI responses:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
HEATHER_ALLOW_PAID_API=true
```

If no API key is present, or `HEATHER_ALLOW_PAID_API` is not set to `true`, Heather uses the local deterministic assistant in `packages/core` so the app remains usable offline.

For no-credit local model responses, run an Ollama-compatible server and set:

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1
```

Cost-control defaults:

- `local_only` is the default and does not call `/api/chat` from the browser.
- Repeated cloud/local-model requests are cached in browser storage and in the server route.
- Paid API calls require the Settings toggle, a monthly call limit above zero, and `HEATHER_ALLOW_PAID_API=true`.
- OpenAI context and output tokens are intentionally capped.
- Heather does not implement payment bypasses or unauthorized credit workarounds.

## Phase 1 Scope

- Chat with Heather persona, conversation persistence, search, and title generation.
- Voice controls with browser speech recognition/TTS where available.
- Project memory seeded with the requested examples.
- Personal memory CRUD with archive/delete controls.
- Pinta-inspired learning architecture with teaching records and generative tool routing.
- Project summary generation.
- Person/organization analysis in the requested structure.
- Daily briefing from current conversations, projects, and memories.
- Settings for tone, voice, memory behavior, confirmations, and destructive data deletion.
- PWA manifest, icon placeholder, and service worker cache shell.

## Desktop Expansion

Desktop-only operations are available through `PlatformAdapter` interfaces but are marked unavailable in the web adapter. Tauri/Electron can later implement local file access, app launch, clipboard, screen capture, and wake-word behavior without changing the core assistant logic.

## Teaching Heather

The `학습/생성` panel lets you teach Heather directives, preferences, examples, corrections, skills, and boundary rules. Those records are stored locally and applied to local-only responses, local-model responses, and cloud-provider prompts.

See `docs/pinta-inspired-heather-learning.md` for the architecture note.
