-- Defense-in-depth account isolation for uploaded personal/research documents.
-- Server queries are also explicitly filtered by the authenticated user.

create index if not exists documents_user_scope_uploaded_idx
  on public.documents(user_id, memory_scope, uploaded_at desc);
create index if not exists memory_candidates_user_document_idx
  on public.memory_candidates(user_id, document_id, created_at desc);
create index if not exists document_versions_document_idx
  on public.document_versions(document_id);
create index if not exists document_extractions_document_idx
  on public.document_extractions(document_id);
create index if not exists document_chunks_document_idx
  on public.document_chunks(document_id);

alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_extractions enable row level security;
alter table public.document_chunks enable row level security;
alter table public.memory_candidates enable row level security;

alter table public.documents force row level security;
alter table public.document_versions force row level security;
alter table public.document_extractions force row level security;
alter table public.document_chunks force row level security;
alter table public.memory_candidates force row level security;

-- Remove all older permissive policies. PostgreSQL permissive policies combine
-- with OR, so one forgotten policy could expose another user's records.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'documents',
    'document_versions',
    'document_extractions',
    'document_chunks',
    'memory_candidates'
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

create policy "documents own rows"
on public.documents
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "document versions through owned document"
on public.document_versions
for all
using (
  exists (
    select 1
    from public.documents document
    where document.id = document_id
      and document.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.documents document
    where document.id = document_id
      and document.user_id = auth.uid()
  )
);

create policy "document extractions through owned document"
on public.document_extractions
for all
using (
  exists (
    select 1
    from public.documents document
    where document.id = document_id
      and document.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.documents document
    where document.id = document_id
      and document.user_id = auth.uid()
  )
);

create policy "document chunks through owned document"
on public.document_chunks
for all
using (
  exists (
    select 1
    from public.documents document
    where document.id = document_id
      and document.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.documents document
    where document.id = document_id
      and document.user_id = auth.uid()
  )
);

create policy "memory candidates own document rows"
on public.memory_candidates
for all
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.documents document
    where document.id = document_id
      and document.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.documents document
    where document.id = document_id
      and document.user_id = auth.uid()
  )
);

-- Prevent mismatched candidate ownership even when a privileged server client
-- writes the row. This blocks a candidate from linking one user's account to
-- another user's document.
create or replace function public.enforce_memory_candidate_document_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.documents document
    where document.id = new.document_id
      and document.user_id = new.user_id
  ) then
    raise exception 'memory candidate document owner mismatch'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists memory_candidate_document_owner_guard
  on public.memory_candidates;
create trigger memory_candidate_document_owner_guard
before insert or update of user_id, document_id
on public.memory_candidates
for each row
execute function public.enforce_memory_candidate_document_owner();
