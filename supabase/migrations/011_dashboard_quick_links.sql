-- Dashboard Quick Access links are user-owned bookmarks. This migration is additive.

create table if not exists public.quick_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.context_projects(id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  normalized_name text not null check (char_length(normalized_name) between 1 and 180),
  url text not null check (url ~* '^https?://'),
  canonical_url text not null check (canonical_url ~* '^https?://'),
  hostname text not null check (char_length(hostname) between 1 and 253),
  provider text,
  icon_key text,
  favicon_url text,
  category text not null default 'work' check (char_length(category) between 1 and 80),
  display_order integer not null default 0,
  pinned boolean not null default true,
  open_mode text not null default 'external' check (open_mode in ('external', 'same_tab')),
  status_mode text not null default 'active' check (status_mode in ('active', 'hidden')),
  created_by text not null default 'manual_ui' check (created_by in ('manual_ui', 'chat_command', 'project_import', 'seed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, canonical_url)
);

create index if not exists quick_links_user_category_order_idx on public.quick_links(user_id, category, pinned desc, display_order, created_at);
create index if not exists quick_links_user_name_idx on public.quick_links(user_id, normalized_name);

alter table public.quick_links enable row level security;

create policy "quick links own rows" on public.quick_links
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$ begin
  create trigger quick_links_updated_at before update on public.quick_links
  for each row execute procedure public.set_updated_at();
exception when duplicate_object then null;
end $$;
