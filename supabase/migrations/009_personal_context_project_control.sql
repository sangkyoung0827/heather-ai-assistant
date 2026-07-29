-- Phase 10: user-approved personal context and project control plane.
-- This migration is additive. It does not move, alter, or delete existing memory data.

create table if not exists public.identity_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 12000),
  structured_content jsonb not null default '{}'::jsonb,
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  temporal_stability text not null default 'stable' check (temporal_stability in ('stable', 'review_periodically', 'volatile')),
  source text not null default 'manual',
  last_reviewed_at timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.preference_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 12000),
  structured_content jsonb not null default '{}'::jsonb,
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  temporal_stability text not null default 'review_periodically' check (temporal_stability in ('stable', 'review_periodically', 'volatile')),
  source text not null default 'manual',
  last_reviewed_at timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.context_projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.research_teams(id) on delete set null,
  slug text not null check (slug ~ '^[a-z0-9-]{2,80}$'),
  name text not null check (char_length(name) between 1 and 160),
  description text,
  status text not null default 'planning' check (status in ('idea', 'planning', 'active', 'paused', 'blocked', 'completed', 'archived')),
  priority text not null default 'medium' check (priority in ('highest', 'high', 'medium', 'low')),
  project_type text not null default 'personal',
  visibility text not null default 'private' check (visibility in ('private', 'team')),
  operational_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, slug),
  check ((visibility = 'private' and team_id is null) or (visibility = 'team' and team_id is not null))
);

create table if not exists public.context_project_aliases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.context_projects(id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 160),
  normalized_alias text not null check (char_length(normalized_alias) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (project_id, normalized_alias)
);

create table if not exists public.project_context_memories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.context_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 20000),
  structured_content jsonb not null default '{}'::jsonb,
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  temporal_stability text not null default 'review_periodically' check (temporal_stability in ('stable', 'review_periodically', 'volatile')),
  source text not null default 'manual',
  last_reviewed_at timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operational_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.context_projects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 12000),
  structured_content jsonb not null default '{}'::jsonb,
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  source text not null default 'manual',
  last_reviewed_at timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sensitive material is isolated from the normal context resolver and never shared with a team.
create table if not exists public.sensitive_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 12000),
  category text not null default 'private_note',
  source text not null default 'manual',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.context_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check (resource_type in ('github_repository', 'vercel_project', 'supabase_project', 'google_drive', 'google_doc', 'youtube_channel', 'web_url', 'other')),
  label text not null check (char_length(label) between 1 and 200),
  url text not null check (url ~ '^https?://'),
  canonical_url text not null check (canonical_url ~ '^https?://'),
  metadata jsonb not null default '{}'::jsonb,
  health_status text not null default 'unknown' check (health_status in ('healthy', 'degraded', 'unreachable', 'authentication_required', 'unknown')),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, canonical_url)
);

create table if not exists public.context_connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connector_type text not null check (connector_type in ('github', 'vercel', 'supabase', 'google', 'youtube', 'public_web')),
  display_name text not null check (char_length(display_name) between 1 and 120),
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'expired', 'revoked', 'error', 'disabled')),
  scopes jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, connector_type)
);

create table if not exists public.connector_capabilities (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.context_connectors(id) on delete cascade,
  capability text not null check (char_length(capability) between 1 and 160),
  permission_level text not null check (permission_level in ('observe', 'propose', 'approval_execute', 'strong_approval')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (connector_id, capability)
);

create table if not exists public.permission_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.context_projects(id) on delete cascade,
  connector_type text,
  capability text not null check (char_length(capability) between 1 and 160),
  permission_level text not null check (permission_level in ('observe', 'propose', 'approval_execute', 'strong_approval')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, project_id, connector_type, capability)
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.context_projects(id) on delete set null,
  connector_type text,
  capability text not null,
  permission_level text not null check (permission_level in ('observe', 'propose', 'approval_execute', 'strong_approval')),
  action_summary text not null check (char_length(action_summary) between 1 and 2000),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'executed', 'failed')),
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.action_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.context_projects(id) on delete set null,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  connector_type text,
  capability text not null,
  action_summary text not null,
  status text not null check (status in ('proposed', 'approved', 'rejected', 'executed', 'failed')),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.context_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  status text not null default 'preview' check (status in ('preview', 'committed', 'cancelled')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create table if not exists public.context_import_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.context_import_batches(id) on delete cascade,
  item_type text not null check (item_type in ('identity', 'preference', 'project', 'operational', 'sensitive', 'project_registry')),
  payload jsonb not null,
  recommended_action text not null default 'import' check (recommended_action in ('import', 'review', 'exclude')),
  selected boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'imported', 'skipped', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.context_projects(id) on delete cascade,
  resource_id uuid references public.project_resources(id) on delete set null,
  sync_type text not null check (sync_type in ('github_public_read', 'public_web_check', 'manual')),
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  result_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists context_projects_owner_idx on public.context_projects(owner_user_id, updated_at desc);
create index if not exists project_aliases_normalized_idx on public.context_project_aliases(normalized_alias);
create index if not exists project_context_memories_project_idx on public.project_context_memories(project_id, updated_at desc);
create index if not exists operational_contexts_user_valid_idx on public.operational_contexts(user_id, valid_until);
create index if not exists project_resources_project_idx on public.project_resources(project_id, updated_at desc);
create index if not exists approval_requests_user_status_idx on public.approval_requests(user_id, status, created_at desc);
create index if not exists action_audit_logs_user_created_idx on public.action_audit_logs(user_id, created_at desc);
create index if not exists context_import_batches_user_idx on public.context_import_batches(user_id, created_at desc);

do $$ begin create trigger identity_memories_updated_at before update on public.identity_memories for each row execute procedure public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger preference_memories_updated_at before update on public.preference_memories for each row execute procedure public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger context_projects_updated_at before update on public.context_projects for each row execute procedure public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger project_context_memories_updated_at before update on public.project_context_memories for each row execute procedure public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger operational_contexts_updated_at before update on public.operational_contexts for each row execute procedure public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger sensitive_memories_updated_at before update on public.sensitive_memories for each row execute procedure public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger project_resources_updated_at before update on public.project_resources for each row execute procedure public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger context_connectors_updated_at before update on public.context_connectors for each row execute procedure public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger permission_policies_updated_at before update on public.permission_policies for each row execute procedure public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger approval_requests_updated_at before update on public.approval_requests for each row execute procedure public.set_updated_at(); exception when duplicate_object then null; end $$;

alter table public.identity_memories enable row level security;
alter table public.preference_memories enable row level security;
alter table public.context_projects enable row level security;
alter table public.context_project_aliases enable row level security;
alter table public.project_context_memories enable row level security;
alter table public.operational_contexts enable row level security;
alter table public.sensitive_memories enable row level security;
alter table public.project_resources enable row level security;
alter table public.context_connectors enable row level security;
alter table public.connector_capabilities enable row level security;
alter table public.permission_policies enable row level security;
alter table public.approval_requests enable row level security;
alter table public.action_audit_logs enable row level security;
alter table public.context_import_batches enable row level security;
alter table public.context_import_items enable row level security;
alter table public.project_sync_runs enable row level security;

create policy "identity memories own rows" on public.identity_memories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "preference memories own rows" on public.preference_memories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "control projects visible to owner or team" on public.context_projects for select using (owner_user_id = auth.uid() or (team_id is not null and public.is_active_team_member(team_id)));
create policy "control projects owner create" on public.context_projects for insert with check (owner_user_id = auth.uid() and (team_id is null or public.can_edit_team(team_id)));
create policy "control projects owner manage" on public.context_projects for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid() and (team_id is null or public.can_edit_team(team_id)));
create policy "control projects owner delete" on public.context_projects for delete using (owner_user_id = auth.uid());
create policy "project aliases readable with project" on public.context_project_aliases for select using (exists (select 1 from public.context_projects p where p.id = project_id and (p.owner_user_id = auth.uid() or (p.team_id is not null and public.is_active_team_member(p.team_id)))));
create policy "project aliases owner write" on public.context_project_aliases for all using (exists (select 1 from public.context_projects p where p.id = project_id and p.owner_user_id = auth.uid())) with check (exists (select 1 from public.context_projects p where p.id = project_id and p.owner_user_id = auth.uid()));
create policy "project context readable with project" on public.project_context_memories for select using (user_id = auth.uid() or exists (select 1 from public.context_projects p where p.id = project_id and p.team_id is not null and public.is_active_team_member(p.team_id)));
create policy "project context owner write" on public.project_context_memories for all using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (select 1 from public.context_projects p where p.id = project_id and p.owner_user_id = auth.uid()));
create policy "operational context own rows" on public.operational_contexts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sensitive memories own rows" on public.sensitive_memories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "resources readable with project" on public.project_resources for select using (user_id = auth.uid() or exists (select 1 from public.context_projects p where p.id = project_id and p.team_id is not null and public.is_active_team_member(p.team_id)));
create policy "resources owner write" on public.project_resources for all using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (select 1 from public.context_projects p where p.id = project_id and p.owner_user_id = auth.uid()));
create policy "connectors own rows" on public.context_connectors for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "connector capabilities own connector" on public.connector_capabilities for all using (exists (select 1 from public.context_connectors c where c.id = connector_id and c.user_id = auth.uid())) with check (exists (select 1 from public.context_connectors c where c.id = connector_id and c.user_id = auth.uid()));
create policy "permission policies own rows" on public.permission_policies for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "approval requests own rows" on public.approval_requests for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "audit logs own rows" on public.action_audit_logs for select using (user_id = auth.uid());
create policy "audit logs own inserts" on public.action_audit_logs for insert with check (user_id = auth.uid());
create policy "import batches own rows" on public.context_import_batches for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "import items own batch" on public.context_import_items for all using (exists (select 1 from public.context_import_batches b where b.id = batch_id and b.user_id = auth.uid())) with check (exists (select 1 from public.context_import_batches b where b.id = batch_id and b.user_id = auth.uid()));
create policy "sync runs own rows" on public.project_sync_runs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
