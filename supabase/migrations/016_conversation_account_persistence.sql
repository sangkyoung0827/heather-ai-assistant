begin;

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;

-- Conversation metadata is visible and mutable only to its authenticated owner.
drop policy if exists conversations_owner_select on public.conversations;
create policy conversations_owner_select
on public.conversations
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists conversations_owner_insert on public.conversations;
create policy conversations_owner_insert
on public.conversations
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists conversations_owner_update on public.conversations;
create policy conversations_owner_update
on public.conversations
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists conversations_owner_delete on public.conversations;
create policy conversations_owner_delete
on public.conversations
for delete
to authenticated
using (owner_id = auth.uid());

-- Message ownership follows the parent conversation.
drop policy if exists conversation_messages_owner_select on public.conversation_messages;
create policy conversation_messages_owner_select
on public.conversation_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_messages.conversation_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists conversation_messages_owner_insert on public.conversation_messages;
create policy conversation_messages_owner_insert
on public.conversation_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_messages.conversation_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists conversation_messages_owner_update on public.conversation_messages;
create policy conversation_messages_owner_update
on public.conversation_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_messages.conversation_id
      and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_messages.conversation_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists conversation_messages_owner_delete on public.conversation_messages;
create policy conversation_messages_owner_delete
on public.conversation_messages
for delete
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_messages.conversation_id
      and c.owner_id = auth.uid()
  )
);

-- Research image attachments use a conversation UUID as the first path segment.
drop policy if exists chat_media_owner_select on storage.objects;
create policy chat_media_owner_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-media'
  and exists (
    select 1
    from public.conversations c
    where c.id::text = split_part(name, '/', 1)
      and c.owner_id = auth.uid()
  )
);

drop policy if exists chat_media_owner_insert on storage.objects;
create policy chat_media_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and exists (
    select 1
    from public.conversations c
    where c.id::text = split_part(name, '/', 1)
      and c.owner_id = auth.uid()
  )
);

drop policy if exists chat_media_owner_update on storage.objects;
create policy chat_media_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'chat-media'
  and exists (
    select 1
    from public.conversations c
    where c.id::text = split_part(name, '/', 1)
      and c.owner_id = auth.uid()
  )
)
with check (
  bucket_id = 'chat-media'
  and exists (
    select 1
    from public.conversations c
    where c.id::text = split_part(name, '/', 1)
      and c.owner_id = auth.uid()
  )
);

drop policy if exists chat_media_owner_delete on storage.objects;
create policy chat_media_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-media'
  and exists (
    select 1
    from public.conversations c
    where c.id::text = split_part(name, '/', 1)
      and c.owner_id = auth.uid()
  )
);

commit;
