-- Heather Phase 4: audit-safe, user-scoped Skill execution records.

create table if not exists public.skill_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id text not null check (char_length(skill_id) between 1 and 120),
  skill_version text not null check (char_length(skill_version) between 1 and 40),
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  scope text not null check (scope in ('personal')),
  input_metadata jsonb not null default '{}'::jsonb,
  output_metadata jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.skill_run_steps (
  id uuid primary key default gen_random_uuid(),
  skill_run_id uuid not null references public.skill_runs(id) on delete cascade,
  step_index integer not null check (step_index > 0),
  tool_name text not null check (char_length(tool_name) between 1 and 120),
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (skill_run_id, step_index)
);

create index if not exists skill_runs_user_created_idx on public.skill_runs(user_id, created_at desc);
create index if not exists skill_run_steps_run_idx on public.skill_run_steps(skill_run_id, step_index);

alter table public.skill_runs enable row level security;
alter table public.skill_run_steps enable row level security;

create policy "skill runs own rows" on public.skill_runs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "skill run steps own rows" on public.skill_run_steps for all using (
  exists (select 1 from public.skill_runs where public.skill_runs.id = skill_run_id and public.skill_runs.user_id = auth.uid())
) with check (
  exists (select 1 from public.skill_runs where public.skill_runs.id = skill_run_id and public.skill_runs.user_id = auth.uid())
);

