# Heather Direct Commands Supabase Setup

## 1. Create a Supabase project

Create a new Supabase project, then open Project Settings and API. Copy the Project URL and anon public key. Never use a service role key in browser code.

## 2. Run the SQL migration

Open Supabase SQL Editor and run the contents of:

```text
supabase/migrations/001_create_direct_commands.sql
```

The migration creates the `direct_commands` table, indexes, usage tracking function, and MVP access policies.

## 3. Required environment variables

Use these locally in `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

The app can build without these keys and will use local fallback, but Supabase persistence requires them.

## 4. Add variables to Vercel

In Vercel project settings, add:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Redeploy after saving. Do not add a service role key.

## 5. Test after deployment

Add this command in `직접명령등록`:

```text
title: Last Night on Earth
question: 유튜브 뮤직 실행해서 Last night on earth 재생해줘.
response: 네, Last night on earth 재생합니다.
```

Refresh the page and confirm the command remains. Then open `채팅` and send the question. The answer must be exactly:

```text
네, Last night on earth 재생합니다.
```

Check that `usage_count` increments and `last_used_at` updates. Export JSON, delete the command, import JSON, and confirm the command is restored. Disable it and confirm it no longer matches.
