-- Phase 9: research-only DHA process simulation. No table represents a physical controller or measured production output.

create table if not exists public.production_simulation_profiles (
  id text primary key,
  code text not null unique,
  name text not null,
  description text not null,
  version text not null,
  organism_label text not null,
  evidence_level text not null check (evidence_level in ('synthetic_safe', 'literature_calibrated')),
  configuration jsonb not null default '{}'::jsonb,
  literature_references jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.research_teams(id) on delete set null,
  project_id uuid references public.research_projects(id) on delete set null,
  title text not null,
  original_instruction text not null,
  parsed_plan jsonb not null,
  objective text not null,
  profile_id text not null references public.production_simulation_profiles(id),
  model_version text not null,
  random_seed integer not null,
  status text not null check (status in ('draft', 'validating', 'ready', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  final_result jsonb,
  recommended_harvest_hour numeric,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((team_id is null and project_id is null) or (team_id is not null and project_id is not null))
);

create table if not exists public.production_experiment_timepoints (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.production_experiments(id) on delete cascade,
  time_h numeric not null check (time_h >= 0),
  phase text not null,
  measurements jsonb not null,
  created_at timestamptz not null default now(),
  unique (experiment_id, time_h)
);

create table if not exists public.production_experiment_events (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.production_experiments(id) on delete cascade,
  time_h numeric not null check (time_h >= 0),
  event_type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.production_experiment_analyses (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.production_experiments(id) on delete cascade,
  analysis_type text not null,
  content jsonb not null,
  evidence_level text not null check (evidence_level in ('simulation_only', 'literature_supported', 'repeated_simulation_pattern', 'simulation_and_literature_supported')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  supporting_source_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.production_experiment_recommendations (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.production_experiments(id) on delete cascade,
  recommendation_type text not null check (recommendation_type in ('exploitation', 'exploration', 'reproducibility')),
  proposed_plan jsonb not null,
  rationale text not null,
  evidence_level text not null default 'simulation_only',
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  status text not null default 'suggested' check (status in ('suggested', 'approved', 'dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.production_memory_candidates (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.production_experiments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  structured_content jsonb not null default '{}'::jsonb,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  status text not null default 'suggested' check (status in ('suggested', 'approved', 'dismissed')),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists production_experiments_user_created_idx on public.production_experiments(user_id, created_at desc);
create index if not exists production_timepoints_experiment_idx on public.production_experiment_timepoints(experiment_id, time_h);
create index if not exists production_events_experiment_idx on public.production_experiment_events(experiment_id, time_h);

alter table public.production_simulation_profiles enable row level security;
alter table public.production_experiments enable row level security;
alter table public.production_experiment_timepoints enable row level security;
alter table public.production_experiment_events enable row level security;
alter table public.production_experiment_analyses enable row level security;
alter table public.production_experiment_recommendations enable row level security;
alter table public.production_memory_candidates enable row level security;

create policy "production profiles authenticated read" on public.production_simulation_profiles for select using (auth.role() = 'authenticated' and active = true);
create policy "production experiments own rows" on public.production_experiments for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "production timepoints own experiment" on public.production_experiment_timepoints for all using (exists (select 1 from public.production_experiments e where e.id = experiment_id and e.user_id = auth.uid())) with check (exists (select 1 from public.production_experiments e where e.id = experiment_id and e.user_id = auth.uid()));
create policy "production events own experiment" on public.production_experiment_events for all using (exists (select 1 from public.production_experiments e where e.id = experiment_id and e.user_id = auth.uid())) with check (exists (select 1 from public.production_experiments e where e.id = experiment_id and e.user_id = auth.uid()));
create policy "production analyses own experiment" on public.production_experiment_analyses for all using (exists (select 1 from public.production_experiments e where e.id = experiment_id and e.user_id = auth.uid())) with check (exists (select 1 from public.production_experiments e where e.id = experiment_id and e.user_id = auth.uid()));
create policy "production recommendations own experiment" on public.production_experiment_recommendations for all using (exists (select 1 from public.production_experiments e where e.id = experiment_id and e.user_id = auth.uid())) with check (exists (select 1 from public.production_experiments e where e.id = experiment_id and e.user_id = auth.uid()));
create policy "production memory candidates own rows" on public.production_memory_candidates for all using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into public.production_simulation_profiles (id, code, name, description, version, organism_label, evidence_level, configuration, literature_references)
values
('DEMO_SYNTHETIC_SAFE_V1', 'DEMO_SYNTHETIC_SAFE_V1', 'Synthetic safe two-stage demo', 'Research-only literature-range demonstration profile. Not a physical process recipe.', '1.0.0', 'Schizochytrium-like thraustochytrid', 'synthetic_safe', '{"light_required": false, "process_mode": "staged_fed_batch"}', '[]'::jsonb),
('SCHIZOCHYTRIUM_REFERENCE_V1', 'SCHIZOCHYTRIUM_REFERENCE_V1', 'Schizochytrium reference envelope', 'Research-only strain-dependent reference envelope.', '1.0.0', 'Schizochytrium-like thraustochytrid', 'literature_calibrated', '{"light_required": false}', '[]'::jsonb),
('SCHIZOCHYTRIUM_TWO_STAGE_DO_TEMP_V1', 'SCHIZOCHYTRIUM_TWO_STAGE_DO_TEMP_V1', 'Two-stage DO and temperature shift', 'Research-only two-stage comparison profile.', '1.0.0', 'Schizochytrium-like thraustochytrid', 'literature_calibrated', '{"light_required": false}', '[]'::jsonb),
('SCHIZOCHYTRIUM_STAGED_PH_V1', 'SCHIZOCHYTRIUM_STAGED_PH_V1', 'Staged pH control', 'Research-only staged pH comparison profile.', '1.0.0', 'Schizochytrium-like thraustochytrid', 'literature_calibrated', '{"light_required": false}', '[]'::jsonb)
on conflict (id) do nothing;
