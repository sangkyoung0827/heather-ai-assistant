-- Conversation-level execution mode. Additive: existing conversations remain advanced reasoning.
alter table public.conversations
  add column if not exists execution_mode text not null default 'ADVANCED_REASONING',
  add column if not exists execution_mode_updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversations_execution_mode_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_execution_mode_check
      check (execution_mode in ('HEATHER_BASIC', 'ADVANCED_REASONING'));
  end if;
end $$;

update public.conversations
set execution_mode = 'ADVANCED_REASONING'
where execution_mode is null or execution_mode not in ('HEATHER_BASIC', 'ADVANCED_REASONING');

create index if not exists conversations_owner_type_execution_mode_idx
  on public.conversations (owner_id, conversation_type, execution_mode);
