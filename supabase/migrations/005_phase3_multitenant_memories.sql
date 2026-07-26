-- Heather Phase 3: authenticated, user-scoped memory storage.
-- This migration intentionally does not import or delete legacy browser memory keys.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 10000),
  title text,
  summary text,
  memory_type text not null default 'important_fact',
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  description text,
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_team_members (
  team_id uuid not null references public.research_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'removed')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.research_projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.research_teams(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('private', 'team')),
  team_id uuid references public.research_teams(id) on delete cascade,
  project_id uuid references public.research_projects(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 20000),
  title text,
  summary text,
  memory_type text not null default 'project_context',
  tags text[] not null default '{}',
  structured_data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_memory_scope_shape check (
    (scope = 'private' and team_id is null and project_id is null) or
    (scope = 'team' and team_id is not null and project_id is not null)
  )
);

create index if not exists personal_memories_user_updated_idx on public.personal_memories(user_id, updated_at desc);
create index if not exists research_memories_owner_updated_idx on public.research_memories(owner_id, updated_at desc);
create index if not exists research_memories_project_updated_idx on public.research_memories(project_id, updated_at desc);
create index if not exists research_projects_team_idx on public.research_projects(team_id, created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.handle_new_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), new.raw_user_meta_data ->> 'avatar_url', new.email)
  on conflict (id) do update set display_name = excluded.display_name, avatar_url = excluded.avatar_url, email = excluded.email, updated_at = now();
  return new;
end;
$$;

insert into public.profiles (id, display_name, avatar_url, email)
select id, coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name'), raw_user_meta_data ->> 'avatar_url', email from auth.users
on conflict (id) do nothing;

drop trigger if exists heather_on_auth_user_profile on auth.users;
create trigger heather_on_auth_user_profile after insert or update of email, raw_user_meta_data on auth.users for each row execute procedure public.handle_new_profile();

create or replace function public.add_team_owner_membership() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.research_team_members (team_id, user_id, role, status, invited_by, joined_at)
  values (new.id, new.owner_id, 'owner', 'active', new.owner_id, now())
  on conflict (team_id, user_id) do update set role = 'owner', status = 'active', joined_at = coalesce(public.research_team_members.joined_at, now());
  return new;
end;
$$;
drop trigger if exists research_team_owner_membership on public.research_teams;
create trigger research_team_owner_membership after insert on public.research_teams for each row execute procedure public.add_team_owner_membership();

do $$ begin
  create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger personal_memories_updated_at before update on public.personal_memories for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger research_teams_updated_at before update on public.research_teams for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger research_projects_updated_at before update on public.research_projects for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger research_memories_updated_at before update on public.research_memories for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

create or replace function public.is_active_team_member(target_team uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.research_team_members where team_id = target_team and user_id = auth.uid() and status = 'active');
$$;
create or replace function public.can_edit_team(target_team uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.research_team_members where team_id = target_team and user_id = auth.uid() and status = 'active' and role in ('owner', 'editor'));
$$;
create or replace function public.is_team_owner(target_team uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.research_team_members where team_id = target_team and user_id = auth.uid() and status = 'active' and role = 'owner');
$$;

create or replace function public.validate_research_memory_scope() returns trigger language plpgsql security definer set search_path = public as $$
declare project_team uuid;
begin
  if new.scope = 'private' then
    if new.team_id is not null or new.project_id is not null then raise exception 'Private research memories cannot reference a team or project'; end if;
  else
    select team_id into project_team from public.research_projects where id = new.project_id;
    if project_team is null or project_team <> new.team_id then raise exception 'Research project must belong to the selected team'; end if;
  end if;
  return new;
end;
$$;
do $$ begin
  create trigger research_memory_scope_guard before insert or update on public.research_memories for each row execute procedure public.validate_research_memory_scope();
exception when duplicate_object then null; end $$;

alter table public.profiles enable row level security;
alter table public.personal_memories enable row level security;
alter table public.research_teams enable row level security;
alter table public.research_team_members enable row level security;
alter table public.research_projects enable row level security;
alter table public.research_memories enable row level security;

create policy "profiles own row" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "personal memories own rows" on public.personal_memories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "teams visible to active members" on public.research_teams for select using (public.is_active_team_member(id));
create policy "teams created by owner" on public.research_teams for insert with check (owner_id = auth.uid());
create policy "teams managed by owner" on public.research_teams for update using (public.is_team_owner(id)) with check (public.is_team_owner(id));
create policy "team members visible to active members" on public.research_team_members for select using (public.is_active_team_member(team_id));
create policy "team members managed by owner" on public.research_team_members for all using (public.is_team_owner(team_id)) with check (public.is_team_owner(team_id));
create policy "projects visible to active members" on public.research_projects for select using (public.is_active_team_member(team_id));
create policy "projects created by editors" on public.research_projects for insert with check (created_by = auth.uid() and public.can_edit_team(team_id));
create policy "projects managed by editors" on public.research_projects for update using (public.can_edit_team(team_id)) with check (public.can_edit_team(team_id));
create policy "private research memories own rows" on public.research_memories for select using (scope = 'private' and owner_id = auth.uid());
create policy "team research memories visible to members" on public.research_memories for select using (scope = 'team' and public.is_active_team_member(team_id));
create policy "private research memories own writes" on public.research_memories for insert with check (scope = 'private' and owner_id = auth.uid());
create policy "team research memories editor writes" on public.research_memories for insert with check (scope = 'team' and owner_id = auth.uid() and public.can_edit_team(team_id));
create policy "research memory updates by author or owner" on public.research_memories for update using (owner_id = auth.uid() or public.is_team_owner(team_id)) with check ((scope = 'private' and owner_id = auth.uid()) or (scope = 'team' and public.can_edit_team(team_id)));
create policy "research memory deletes by author or owner" on public.research_memories for delete using (owner_id = auth.uid() or (scope = 'team' and public.is_team_owner(team_id)));
