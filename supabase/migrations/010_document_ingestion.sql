-- Universal document ingestion is additive. It never migrates or deletes existing memories.
create extension if not exists pgcrypto;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  memory_scope text not null check (memory_scope in ('personal', 'research', 'project', 'sensitive')),
  document_type text not null default 'general' check (document_type in ('journal', 'reflection', 'plan', 'profile', 'general', 'paper', 'research_note', 'experiment_data', 'report', 'presentation', 'image', 'audio', 'video', 'other')),
  title text not null check (char_length(title) between 1 and 300),
  original_filename text not null check (char_length(original_filename) between 1 and 512),
  mime_type text not null,
  extension text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 26214400),
  storage_path text not null unique,
  checksum text not null check (char_length(checksum) = 64),
  language text,
  source_date date,
  uploaded_at timestamptz not null default now(),
  parsing_status text not null default 'queued' check (parsing_status in ('queued', 'processing', 'completed', 'needs_review', 'unsupported', 'failed')),
  sensitivity text not null default 'normal' check (sensitivity in ('normal', 'high', 'sensitive')),
  access_mode text not null default 'review' check (access_mode in ('archive_only', 'review', 'search_allowed', 'memory_candidate_allowed')),
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version integer not null check (version > 0),
  checksum text not null check (char_length(checksum) = 64),
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create table if not exists public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  parser text not null,
  parser_version text not null,
  status text not null check (status in ('completed', 'needs_review', 'unsupported', 'failed')),
  extracted_text text,
  structured_content jsonb not null default '{}'::jsonb,
  page_count integer,
  word_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  extraction_id uuid not null references public.document_extractions(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  page_start integer,
  page_end integer,
  section_title text,
  content text not null check (char_length(content) between 1 and 6000),
  embedding jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (extraction_id, chunk_index)
);

create table if not exists public.memory_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  project_id uuid,
  target_memory_type text not null check (target_memory_type in ('personal', 'research')),
  title text not null,
  content text not null check (char_length(content) between 1 and 10000),
  structured_content jsonb not null default '{}'::jsonb,
  evidence_chunk_ids uuid[] not null default '{}',
  confidence numeric(3,2) not null default 0.60 check (confidence >= 0 and confidence <= 1),
  temporal_stability text not null default 'needs_review' check (temporal_stability in ('stable', 'time_bound', 'needs_review')),
  sensitivity text not null default 'normal' check (sensitivity in ('normal', 'high', 'sensitive')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'edited', 'rejected', 'committed', 'failed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  committed_memory_id uuid
);

create table if not exists public.personal_pattern_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern_type text not null,
  statement text not null,
  supporting_document_ids uuid[] not null,
  supporting_chunk_ids uuid[] not null,
  first_observed_at date,
  last_observed_at date,
  occurrence_count integer not null default 1,
  confidence numeric(3,2) not null default 0.50 check (confidence >= 0 and confidence <= 1),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'committed')),
  created_at timestamptz not null default now()
);

create unique index if not exists documents_user_scope_checksum_active_idx on public.documents(user_id, memory_scope, checksum) where deleted_at is null;
create index if not exists documents_user_scope_uploaded_idx on public.documents(user_id, memory_scope, uploaded_at desc);
create index if not exists document_chunks_document_idx on public.document_chunks(document_id, chunk_index);
create index if not exists memory_candidates_user_status_idx on public.memory_candidates(user_id, status, created_at desc);

alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_extractions enable row level security;
alter table public.document_chunks enable row level security;
alter table public.memory_candidates enable row level security;
alter table public.personal_pattern_candidates enable row level security;

create policy "documents own rows" on public.documents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "document versions own documents" on public.document_versions for all using (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid())) with check (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()));
create policy "document extractions own documents" on public.document_extractions for all using (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid())) with check (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()));
create policy "document chunks own documents" on public.document_chunks for all using (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid())) with check (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()));
create policy "memory candidates own rows" on public.memory_candidates for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "personal patterns own rows" on public.personal_pattern_candidates for all using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

create policy "document storage own objects" on storage.objects for all
using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
