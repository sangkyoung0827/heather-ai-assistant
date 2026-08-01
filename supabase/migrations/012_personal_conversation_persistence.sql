-- Personal Heather chat persistence. Existing conversation data is retained.
-- New browser-side requests are restricted to the authenticated owner.

create index if not exists conversations_owner_type_last_message_idx
  on public.conversations (owner_id, conversation_type, archived, last_message_at desc, id desc);

drop policy if exists "Heather users read own conversations" on public.conversations;
create policy "Heather users read own conversations"
  on public.conversations for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Heather users create own conversations" on public.conversations;
create policy "Heather users create own conversations"
  on public.conversations for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Heather users update own conversations" on public.conversations;
create policy "Heather users update own conversations"
  on public.conversations for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Heather users delete own conversations" on public.conversations;
create policy "Heather users delete own conversations"
  on public.conversations for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Heather users read own conversation messages" on public.conversation_messages;
create policy "Heather users read own conversation messages"
  on public.conversation_messages for select to authenticated
  using (exists (
    select 1 from public.conversations
    where conversations.id = conversation_messages.conversation_id
      and conversations.owner_id = auth.uid()
  ));

drop policy if exists "Heather users create own conversation messages" on public.conversation_messages;
create policy "Heather users create own conversation messages"
  on public.conversation_messages for insert to authenticated
  with check (exists (
    select 1 from public.conversations
    where conversations.id = conversation_messages.conversation_id
      and conversations.owner_id = auth.uid()
  ));

drop policy if exists "Heather users update own conversation messages" on public.conversation_messages;
create policy "Heather users update own conversation messages"
  on public.conversation_messages for update to authenticated
  using (exists (
    select 1 from public.conversations
    where conversations.id = conversation_messages.conversation_id
      and conversations.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.conversations
    where conversations.id = conversation_messages.conversation_id
      and conversations.owner_id = auth.uid()
  ));

drop policy if exists "Heather users delete own conversation messages" on public.conversation_messages;
create policy "Heather users delete own conversation messages"
  on public.conversation_messages for delete to authenticated
  using (exists (
    select 1 from public.conversations
    where conversations.id = conversation_messages.conversation_id
      and conversations.owner_id = auth.uid()
  ));
