-- Persistent, server-owned conversation storage for Heather general and research chat.
-- This migration is additive and does not modify existing Direct Command or learning data.
create extension if not exists pgcrypto;

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null check (conversation_type in ('general', 'research')),
  title text not null,
  summary text,
  archived boolean not null default false,
  owner_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  source text,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  client_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversations_type_archive_last_message_idx
  on conversations (conversation_type, archived, last_message_at desc, id desc);
create index if not exists conversation_messages_conversation_created_idx
  on conversation_messages (conversation_id, created_at desc, id desc);
create unique index if not exists conversation_messages_client_message_unique_idx
  on conversation_messages (conversation_id, client_message_id)
  where client_message_id is not null;

create or replace function set_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conversations_set_updated_at on conversations;
create trigger conversations_set_updated_at
before update on conversations
for each row execute function set_conversations_updated_at();

alter table conversations enable row level security;
alter table conversation_messages enable row level security;
-- Conversation records are accessed only through server routes using the service role.
-- No anonymous policies are intentionally added before user authentication exists.
