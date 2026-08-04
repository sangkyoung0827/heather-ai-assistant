begin;

-- Repair the owner-scoped Direct Command write path for the fixed Heather owner.
-- This migration is idempotent and may be run after migration 014.

do $$
begin
  if to_regclass('public.direct_commands') is null
     or to_regclass('public.direct_command_triggers') is null
     or to_regclass('public.query_patterns') is null
     or to_regclass('public.intent_events') is null then
    raise exception 'The base Direct Command tables are missing. Apply the earlier Heather migrations first.';
  end if;

  if not exists (
    select 1 from auth.users
    where id = '6ce9c496-e85f-4931-b6f4-737a7f2fd4d8'::uuid
  ) then
    raise exception 'The configured waterfalling Supabase user UUID does not exist in auth.users.';
  end if;
end $$;

alter table public.direct_commands
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table public.direct_command_triggers
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table public.query_patterns
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table public.intent_events
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

-- One-time administrative claim of legacy ownerless rows. This must happen in
-- SQL because an authenticated RLS client cannot update rows whose owner is NULL.
update public.direct_commands
set owner_user_id = '6ce9c496-e85f-4931-b6f4-737a7f2fd4d8'::uuid
where owner_user_id is null;

update public.direct_command_triggers trigger_row
set owner_user_id = command_row.owner_user_id
from public.direct_commands command_row
where trigger_row.command_id = command_row.id
  and trigger_row.owner_user_id is null;

update public.query_patterns
set owner_user_id = '6ce9c496-e85f-4931-b6f4-737a7f2fd4d8'::uuid
where owner_user_id is null;

update public.intent_events
set owner_user_id = '6ce9c496-e85f-4931-b6f4-737a7f2fd4d8'::uuid
where owner_user_id is null;

create index if not exists direct_commands_owner_created_idx
  on public.direct_commands(owner_user_id, created_at desc);
create index if not exists direct_command_triggers_owner_command_idx
  on public.direct_command_triggers(owner_user_id, command_id);
create index if not exists query_patterns_owner_idx
  on public.query_patterns(owner_user_id);
create index if not exists intent_events_owner_idx
  on public.intent_events(owner_user_id);

-- Replace legacy normalized-query uniqueness with owner-scoped uniqueness.
do $$
declare item record;
begin
  for item in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'query_patterns'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%normalized_query%'
      and pg_get_constraintdef(c.oid) not ilike '%owner_user_id%'
  loop
    execute format('alter table public.query_patterns drop constraint %I', item.conname);
  end loop;

  for item in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'query_patterns'
      and indexdef ilike 'create unique index%'
      and indexdef ilike '%normalized_query%'
      and indexdef not ilike '%owner_user_id%'
  loop
    execute format('drop index if exists public.%I', item.indexname);
  end loop;
end $$;

create unique index if not exists query_patterns_owner_normalized_uidx
  on public.query_patterns(owner_user_id, normalized_query);

alter table public.direct_commands enable row level security;
alter table public.direct_command_triggers enable row level security;
alter table public.query_patterns enable row level security;
alter table public.intent_events enable row level security;

alter table public.direct_commands force row level security;
alter table public.direct_command_triggers force row level security;
alter table public.query_patterns force row level security;
alter table public.intent_events force row level security;

-- Remove every prior policy so no stale permissive or incompatible rule remains.
do $$
declare table_name text; policy_name text;
begin
  foreach table_name in array array[
    'direct_commands',
    'direct_command_triggers',
    'query_patterns',
    'intent_events'
  ] loop
    for policy_name in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end $$;

create policy direct_commands_owner_all
on public.direct_commands
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy direct_command_triggers_owner_all
on public.direct_command_triggers
for all
to authenticated
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.direct_commands command_row
    where command_row.id = direct_command_triggers.command_id
      and command_row.owner_user_id = auth.uid()
  )
)
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.direct_commands command_row
    where command_row.id = direct_command_triggers.command_id
      and command_row.owner_user_id = auth.uid()
  )
);

create policy query_patterns_owner_all
on public.query_patterns
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy intent_events_owner_all
on public.intent_events
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

-- RLS policies do not grant table privileges by themselves.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.direct_commands to authenticated;
grant select, insert, update, delete on public.direct_command_triggers to authenticated;
grant select, insert, update, delete on public.query_patterns to authenticated;
grant select, insert, update, delete on public.intent_events to authenticated;

commit;
