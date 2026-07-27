# Heather AI Assistant

Heather / 헤더 is a personal AI assistant web app designed as a PWA first and as a future Tauri or Electron desktop front end later.

The repository is split so browser UI, assistant reasoning, AI providers, database access, and platform capabilities stay separate:

- `apps/web`: Next.js App Router PWA.
- `packages/core`: Pure TypeScript assistant logic, persona, summaries, analysis, briefing, and safety policy.
- `packages/core/src/automation.ts`: Jarvis-inspired automation recipe planning for web-safe and desktop-only actions.
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

Heather chat currently uses **Ollama local models only**. OpenAI API is not called in the default chat path, and `OPENAI_API_KEY` is not required.

Create `.env.local` inside `apps/web` when you want to override Ollama defaults:

```bash
HEATHER_OLLAMA_BASE_URL=http://localhost:11434
HEATHER_OLLAMA_MODEL=gemma4:latest
```

### Ollama setup

Heather can answer without OpenAI by calling a local Ollama server.

1. Install [Ollama](https://ollama.com/)
2. Pull the recommended model:

```bash
ollama pull gemma4:latest
```

3. Start the server:

```bash
ollama serve
```

4. Open Heather and chat. If Ollama is not running or the model is missing, Heather shows a clear setup message instead of a fixed template reply.

Optional lightweight fallback model: `gemma4:latest`

Legacy env aliases also work: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`.

Cost-control defaults:

- `local_model` is the default and routes chat through `/api/chat` to Ollama.
- Repeated requests are cached in browser storage and in the server route.
- OpenAI integration remains disabled in the current chat path even if an API key exists.

## Phase 1 Scope

- Chat with Heather persona, conversation persistence, search, and title generation.
- Voice controls with browser speech recognition/TTS where available.
- Project memory seeded with the requested examples.
- Personal memory CRUD with archive/delete controls.
- Pinta-inspired learning architecture with teaching records and generative tool routing.
- Jarvis-inspired automation recipes with web-executable actions, desktop-only action planning, and browser TTS.
- Project summary generation.
- Person/organization analysis in the requested structure.
- Daily briefing from current conversations, projects, and memories.
- Settings for tone, voice, memory behavior, confirmations, and destructive data deletion.
- PWA manifest, icon placeholder, and service worker cache shell.

## Desktop Expansion

Desktop-only operations are available through `PlatformAdapter` interfaces but are marked unavailable in the web adapter. Tauri/Electron can later implement local file access, app launch, clipboard, screen capture, double-clap detection, and wake-word behavior without changing the core assistant logic.

## Teaching Heather

The `학습/생성` panel lets you teach Heather directives, preferences, examples, corrections, skills, and boundary rules. Those records are stored locally and applied to local-only responses, local-model responses, and cloud-provider prompts.

Use `Jarvis 루틴` for repeatable assistant actions, and use `학습/생성` to teach Heather preferred behavior after a routine succeeds or fails.

See `docs/pinta-inspired-heather-learning.md` and `docs/jarvis-inspired-heather-automation.md` for architecture notes.
