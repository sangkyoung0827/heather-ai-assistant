-- Phase 4 search discovery. Cache payloads must contain normalized source metadata only, never raw prompts or private memory.

create table if not exists public.search_provider_states (
  provider text primary key,
  enabled boolean not null default false,
  status text not null default 'not_configured',
  quota_metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.search_cache (
  cache_key text primary key,
  provider text not null,
  result_metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.research_search_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('private', 'team')),
  team_id uuid references public.research_teams(id) on delete cascade,
  project_id uuid references public.research_projects(id) on delete cascade,
  provider text not null,
  query_hash text not null,
  result_count integer not null default 0,
  created_at timestamptz not null default now(),
  check ((scope = 'private' and team_id is null and project_id is null) or (scope = 'team' and team_id is not null and project_id is not null))
);

create table if not exists public.research_source_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_search_run_id uuid not null references public.research_search_runs(id) on delete cascade,
  canonical_id text not null,
  source_metadata jsonb not null,
  status text not null default 'suggested' check (status in ('suggested', 'opened', 'saved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (research_search_run_id, canonical_id)
);

create table if not exists public.research_source_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_source_candidate_id uuid not null references public.research_source_candidates(id) on delete cascade,
  feedback text not null check (feedback in ('opened', 'saved', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists research_search_runs_user_created_idx on public.research_search_runs(user_id, created_at desc);
create index if not exists research_source_candidates_user_status_idx on public.research_source_candidates(user_id, status, created_at desc);

alter table public.search_provider_states enable row level security;
alter table public.search_cache enable row level security;
alter table public.research_search_runs enable row level security;
alter table public.research_source_candidates enable row level security;
alter table public.research_source_feedback enable row level security;

create policy "provider states authenticated read" on public.search_provider_states for select using (auth.role() = 'authenticated');
create policy "search cache authenticated read" on public.search_cache for select using (auth.role() = 'authenticated');
create policy "private search runs own rows" on public.research_search_runs for all using ((scope = 'private' and user_id = auth.uid()) or (scope = 'team' and public.is_active_team_member(team_id))) with check ((scope = 'private' and user_id = auth.uid()) or (scope = 'team' and user_id = auth.uid() and public.is_active_team_member(team_id)));
create policy "source candidates own rows" on public.research_source_candidates for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "source feedback own rows" on public.research_source_feedback for all using (user_id = auth.uid()) with check (user_id = auth.uid());
