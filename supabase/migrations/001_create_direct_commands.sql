create extension if not exists pgcrypto;

create table if not exists direct_commands (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  question text not null,
  normalized_question text not null,
  response text not null,
  enabled boolean not null default true,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  tags text[] not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists direct_commands_enabled_idx on direct_commands(enabled);
create index if not exists direct_commands_normalized_question_idx on direct_commands(normalized_question);

create or replace function set_direct_commands_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists direct_commands_set_updated_at on direct_commands;
create trigger direct_commands_set_updated_at
before update on direct_commands
for each row
execute function set_direct_commands_updated_at();

create or replace function increment_direct_command_usage(command_id uuid)
returns void
language plpgsql
as $$
begin
  update direct_commands
  set usage_count = usage_count + 1,
      last_used_at = now(),
      updated_at = now()
  where id = command_id;
end;
$$;

alter table direct_commands enable row level security;

drop policy if exists "direct_commands_select" on direct_commands;
create policy "direct_commands_select" on direct_commands
for select using (true);

drop policy if exists "direct_commands_insert" on direct_commands;
create policy "direct_commands_insert" on direct_commands
for insert with check (true);

drop policy if exists "direct_commands_update" on direct_commands;
create policy "direct_commands_update" on direct_commands
for update using (true) with check (true);

drop policy if exists "direct_commands_delete" on direct_commands;
create policy "direct_commands_delete" on direct_commands
for delete using (true);
