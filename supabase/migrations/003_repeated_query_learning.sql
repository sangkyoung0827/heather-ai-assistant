-- Extends the existing Phase 2 intent tables without replacing any stored commands.
alter table query_patterns add column if not exists query_variants text[] not null default '{}';
alter table query_patterns add column if not exists response_candidates text[] not null default '{}';
alter table query_patterns add column if not exists response_fingerprint text;
alter table query_patterns add column if not exists first_seen_at timestamptz not null default now();
alter table query_patterns add column if not exists last_seen_at timestamptz not null default now();
alter table query_patterns add column if not exists promoted_command_id uuid references direct_commands(id) on delete set null;
alter table query_patterns add column if not exists exclusion_reason text;

update query_patterns
set query_variants = examples,
    first_seen_at = coalesce(first_seen_at, created_at),
    last_seen_at = coalesce(last_seen_at, updated_at)
where cardinality(query_variants) = 0;

create index if not exists query_patterns_status_idx on query_patterns(status);
create index if not exists query_patterns_last_seen_at_idx on query_patterns(last_seen_at desc);
create index if not exists query_patterns_promoted_command_id_idx on query_patterns(promoted_command_id);

create table if not exists query_pattern_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  pattern_id uuid references query_patterns(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists query_pattern_messages_pattern_id_idx on query_pattern_messages(pattern_id);

alter table query_pattern_messages enable row level security;
drop policy if exists "query_pattern_messages_all" on query_pattern_messages;
create policy "query_pattern_messages_all" on query_pattern_messages for all using (true) with check (true);
