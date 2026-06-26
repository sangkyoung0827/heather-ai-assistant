# Jarvis-Inspired Heather Automation

## Source Review

The local `jarvis-main` reference is a Python desktop assistant that listens for a double clap, opens work apps and web pages, and plays a welcome voice line. It has no visible license file, so Heather does not copy implementation code from it. Heather only adapts the architecture: trigger, ordered actions, voice feedback, and desktop permission boundaries.

## What Heather Adds

- `AutomationRecipe` stores repeatable assistant routines.
- `AutomationAction` separates web-safe actions from desktop-only actions.
- `automation_planner` lets Heather generate automation plans in chat and the training lab.
- Browser execution currently supports URL opening, browser speech synthesis, and clipboard write when the browser grants permission.
- Desktop-only actions such as local app launch, screen capture, file access, and double-clap listeners are marked for a future desktop bridge.

## Current Default Routine

`Jarvis 시작 루틴` is seeded into local browser storage. It can:

- speak a Korean welcome line through browser TTS;
- open Claude, Binance, and Spotify in browser tabs;
- keep Cursor launch as a desktop-only action until a local shell adapter exists.

## Follow-Up Actions For A Fully Working Personal AI

1. Run Heather locally with `npm run dev` and open `http://localhost:3000`.
2. Use `Jarvis 루틴` to edit the first routine: replace URLs, app names, and welcome text with your real workflow.
3. Keep Settings on `local_only` for no API cost, or install Ollama and set `OLLAMA_BASE_URL` plus `OLLAMA_MODEL` for no-credit generative responses.
4. Build the desktop bridge with Tauri or Electron so `DesktopPlatformAdapter` can implement local app launch, file access, screen capture, clipboard read, and microphone wake triggers.
5. Add a local double-clap or wake-word service in the desktop bridge, then map it to the same `AutomationRecipe` records instead of creating a separate automation system.
6. Store secrets only in server-side environment files. Never put ElevenLabs, OpenAI, or account tokens in client-side React code.
7. Keep destructive actions behind confirmation: payments, deletes, file writes, account edits, and outbound messages.
8. Teach Heather after each real use: save successful routines as `example`, wrong behavior as `correction`, and non-negotiable safety rules as `boundary_rule`.
9. Back up browser storage or migrate the database package to Supabase/PostgreSQL before relying on Heather as a long-term memory system.
10. Fix deployment state before relying on production: the latest local app can build, but the previous Vercel production deployment may still be serving an older commit until the stuck build/private repository integration is resolved.
