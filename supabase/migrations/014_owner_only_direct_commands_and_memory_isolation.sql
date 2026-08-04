-- Heather owner-only Direct Commands and personal-memory isolation hardening.
-- Legacy direct-command rows remain invisible (owner_user_id IS NULL) until the
-- configured Heather owner first uses the server, which claims those rows.

alter table if exists public.direct_commands add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.direct_command_triggers add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.query_patterns add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.intent_events add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

create index if not exists direct_commands_owner_created_idx on public.direct_commands(owner_user_id, created_at desc);
create index if not exists direct_command_triggers_owner_command_idx on public.direct_command_triggers(owner_user_id, command_id);
create index if not exists query_patterns_owner_idx on public.query_patterns(owner_user_id);
create index if not exists intent_events_owner_idx on public.intent_events(owner_user_id);

do $$
declare item record;
begin
  for item in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'query_patterns' and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%normalized_query%'
  loop execute format('alter table public.query_patterns drop constraint %I', item.conname); end loop;
  for item in
    select indexname from pg_indexes
    where schemaname = 'public' and tablename = 'query_patterns'
      and indexdef ilike 'create unique index%' and indexdef ilike '%normalized_query%'
  loop execute format('drop index if exists public.%I', item.indexname); end loop;
end $$;
create unique index if not exists query_patterns_owner_normalized_uidx on public.query_patterns(owner_user_id, normalized_query);

alter table if exists public.direct_commands enable row level security;
alter table if exists public.direct_command_triggers enable row level security;
alter table if exists public.query_patterns enable row level security;
alter table if exists public.intent_events enable row level security;
alter table if exists public.direct_commands force row level security;
alter table if exists public.direct_command_triggers force row level security;
alter table if exists public.query_patterns force row level security;
alter table if exists public.intent_events force row level security;

do $$
declare table_name text; policy_name text;
begin
  foreach table_name in array array['direct_commands','direct_command_triggers','query_patterns','intent_events'] loop
    for policy_name in select policyname from pg_policies where schemaname='public' and tablename=table_name loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end $$;

create policy "direct commands own rows" on public.direct_commands
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "direct command triggers own rows" on public.direct_command_triggers
  for all using (
    owner_user_id = auth.uid() and exists (
      select 1 from public.direct_commands command
      where command.id = command_id and command.owner_user_id = auth.uid()
    )
  ) with check (
    owner_user_id = auth.uid() and exists (
      select 1 from public.direct_commands command
      where command.id = command_id and command.owner_user_id = auth.uid()
    )
  );
create policy "query patterns own rows" on public.query_patterns
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "intent events own rows" on public.intent_events
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- Remove every permissive legacy policy from personal-memory tables before
-- recreating strict account predicates. Multiple permissive policies combine
-- with OR, so leaving one old policy would defeat isolation.
do $$
declare table_name text; policy_name text;
begin
  foreach table_name in array array['personal_memories','personal_memos','personal_memo_entries','personal_memo_versions','conversation_memo_contexts'] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('alter table public.%I force row level security', table_name);
      for policy_name in select policyname from pg_policies where schemaname='public' and tablename=table_name loop
        execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      end loop;
    end if;
  end loop;
end $$;

create policy "personal memories own rows" on public.personal_memories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "persistent personal memos own rows" on public.personal_memos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "persistent personal memo entries own rows" on public.personal_memo_entries
  for all using (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo where memo.id = memo_id and memo.user_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo where memo.id = memo_id and memo.user_id = auth.uid()
    )
  );
create policy "persistent personal memo versions own rows" on public.personal_memo_versions
  for all using (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo where memo.id = memo_id and memo.user_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo where memo.id = memo_id and memo.user_id = auth.uid()
    )
  );
create policy "conversation memo contexts own rows strict" on public.conversation_memo_contexts
  for all using (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo where memo.id = active_memo_id and memo.user_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo where memo.id = active_memo_id and memo.user_id = auth.uid()
    )
  );

create or replace function public.enforce_personal_memo_parent_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.personal_memos memo where memo.id = new.memo_id and memo.user_id = new.user_id) then
    raise exception 'personal memo owner mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists personal_memo_entries_owner_guard on public.personal_memo_entries;
create trigger personal_memo_entries_owner_guard before insert or update on public.personal_memo_entries
  for each row execute function public.enforce_personal_memo_parent_owner();
drop trigger if exists personal_memo_versions_owner_guard on public.personal_memo_versions;
create trigger personal_memo_versions_owner_guard before insert or update on public.personal_memo_versions
  for each row execute function public.enforce_personal_memo_parent_owner();

create or replace function public.enforce_conversation_memo_context_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.personal_memos memo where memo.id = new.active_memo_id and memo.user_id = new.user_id) then
    raise exception 'conversation memo owner mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists conversation_memo_context_owner_guard on public.conversation_memo_contexts;
create trigger conversation_memo_context_owner_guard before insert or update on public.conversation_memo_contexts
  for each row execute function public.enforce_conversation_memo_context_owner();
