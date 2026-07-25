# Heather AI Assistant / 헤더

Heather is a web-first personal AI workspace. The canonical application lives in
`apps/web`; the repository root is only the npm-workspace and Vercel build entry
point.

## Current scope

- Dashboard, Chat, Memory, and Researcher workspaces
- Direct Command Registration: create, edit, delete, search, enable/disable,
  JSON import/export, localStorage migration, direct-match priority, and API fallback
- Local Ollama chat API at `/api/chat`
- Shared packages under `packages/*`

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- API routes
- npm workspaces

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
- build command: `npm run build`
- the root workspace script builds `apps/web`

A push to the connected GitHub repository should trigger Vercel automatically if the project is already linked in Vercel.
