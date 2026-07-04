# Heather AI Assistant / 헤더

Heather 1.0 is a clean web-first MVP for a Jarvis-like personal AI assistant.

This rebuild intentionally abandons the tangled older implementation path. Git history is preserved, but the active app surface is now a simple deployable Next.js web app with no desktop/Tauri runtime dependency.

## Current scope

- Main dashboard
- Chat panel
- Left sidebar
- Web Mode badge
- Action Log panel
- Projects placeholder
- Memory placeholder
- Settings placeholder
- Dark Jarvis-inspired UI
- API route at `/api/chat`

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- API routes
- Web app only

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Deployment

The repository includes `vercel.json` for a Vercel-connected Next.js deployment:

- install command: `npm install`
- build command: `npm run build -w @heather/web`
- output directory: `apps/web/.next`

A push to the connected GitHub repository should trigger Vercel automatically if the project is already linked in Vercel.
