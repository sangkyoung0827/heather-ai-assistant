-- Persistent Personal Memo Write Skills.
-- This migration is additive and keeps legacy personal_memories unchanged.

create table if not exists public.personal_memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  normalized_title text not null check (char_length(normalized_title) between 1 and 240),
  current_summary text not null default '',
  -- Kept nullable and intentionally not foreign-keyed so personal memos remain
  -- usable on installations that have not enabled the optional project module.
  project_id uuid,
  sensitivity text not null default 'normal' check (sensitivity in ('normal', 'high', 'sensitive')),
  status text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.personal_memo_entries (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references public.personal_memos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('initial', 'append', 'correction', 'replacement', 'clarification', 'deletion', 'system_summary')),
  content text not null check (char_length(content) between 1 and 12000),
  normalized_content text not null check (char_length(normalized_content) between 1 and 14000),
  source_type text not null default 'chat_command' check (source_type in ('chat_command', 'manual', 'document', 'system')),
  source_id text,
  source_message_id text,
  effective_date date,
  supersedes_entry_id uuid references public.personal_memo_entries(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'superseded', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_memo_versions (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references public.personal_memos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  change_type text not null check (change_type in ('create', 'append', 'update', 'replace', 'delete', 'restore', 'archive')),
  change_summary text not null check (char_length(change_summary) between 1 and 500),
  source_message_id text,
  created_at timestamptz not null default now(),
  unique (memo_id, version)
);

create table if not exists public.conversation_memo_contexts (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null check (char_length(conversation_id) between 1 and 160),
  active_memo_id uuid not null references public.personal_memos(id) on delete cascade,
  last_action text not null check (last_action in ('create', 'append', 'update', 'replace', 'delete', 'restore', 'get', 'search', 'history')),
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create unique index if not exists personal_memos_user_normalized_active_idx
  on public.personal_memos (user_id, normalized_title)
  where status <> 'deleted';
create index if not exists personal_memos_user_updated_idx
  on public.personal_memos (user_id, status, updated_at desc);
create index if not exists personal_memo_entries_memo_created_idx
  on public.personal_memo_entries (memo_id, status, created_at);
create index if not exists personal_memo_entries_user_content_idx
  on public.personal_memo_entries (user_id, normalized_content);
create index if not exists personal_memo_versions_memo_version_idx
  on public.personal_memo_versions (memo_id, version desc);

do $$ begin
  create trigger personal_memos_updated_at before update on public.personal_memos
  for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger personal_memo_entries_updated_at before update on public.personal_memo_entries
  for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger conversation_memo_contexts_updated_at before update on public.conversation_memo_contexts
  for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

alter table public.personal_memos enable row level security;
alter table public.personal_memo_entries enable row level security;
alter table public.personal_memo_versions enable row level security;
alter table public.conversation_memo_contexts enable row level security;

create policy "personal memos own rows" on public.personal_memos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "personal memo entries own rows" on public.personal_memo_entries
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo
      where memo.id = memo_id and memo.user_id = auth.uid()
    )
  );
create policy "personal memo versions own rows" on public.personal_memo_versions
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo
      where memo.id = memo_id and memo.user_id = auth.uid()
    )
  );
create policy "conversation memo contexts own rows" on public.conversation_memo_contexts
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo
      where memo.id = active_memo_id and memo.user_id = auth.uid()
    )
  );
