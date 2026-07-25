alter table direct_commands add column if not exists canonical_trigger text;
alter table direct_commands add column if not exists created_by text not null default 'user' check (created_by in ('user', 'auto'));
update direct_commands set canonical_trigger = question where canonical_trigger is null;
alter table direct_commands alter column canonical_trigger set not null;

create table if not exists direct_command_triggers (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references direct_commands(id) on delete cascade,
  trigger text not null,
  normalized_trigger text not null,
  created_at timestamptz not null default now(),
  unique(command_id, normalized_trigger)
);
create index if not exists direct_command_triggers_normalized_idx on direct_command_triggers(normalized_trigger);

create table if not exists query_patterns (
  id uuid primary key default gen_random_uuid(),
  normalized_query text not null unique,
  representative_query text not null,
  examples text[] not null default '{}',
  occurrence_count integer not null default 0,
  latest_response text,
  status text not null default 'observed' check (status in ('observed', 'promoted', 'excluded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists intent_events (
  id uuid primary key default gen_random_uuid(),
  input_hash text not null,
  result text not null check (result in ('direct_command', 'fallback')),
  command_id uuid references direct_commands(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists intent_events_created_at_idx on intent_events(created_at desc);

alter table direct_command_triggers enable row level security;
alter table query_patterns enable row level security;
alter table intent_events enable row level security;

drop policy if exists "direct_command_triggers_all" on direct_command_triggers;
create policy "direct_command_triggers_all" on direct_command_triggers for all using (true) with check (true);
drop policy if exists "query_patterns_all" on query_patterns;
create policy "query_patterns_all" on query_patterns for all using (true) with check (true);
drop policy if exists "intent_events_all" on intent_events;
create policy "intent_events_all" on intent_events for all using (true) with check (true);
