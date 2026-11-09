-- Initial schema for Askwell (docs/project.md §7, §9).
--
-- The tables, the row level security and the grants are all in this migration,
-- so the database is only ever half a boundary.
--
-- Roles:
--   anon           a visitor of a customer's website. It gets nothing.
--   authenticated  the owner, with their Clerk session token. RLS scopes them
--                  to their own rows.
--   service_role   the server. It skips RLS and is used after a route has
--                  checked ownership and the plan.

-- Extensions -----------------------------------------------------------------

create schema if not exists extensions;

create extension if not exists vector with schema extensions;

-- Tables ----------------------------------------------------------------------

-- One row per Clerk user. The plan lives here.
create table public.accounts (
  clerk_user_id text primary key,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.accounts (clerk_user_id) on delete cascade,
  name text not null,
  public_key text not null unique,
  messages_used integer not null default 0 check (messages_used >= 0),
  period_start timestamptz not null default date_trunc('month', now()),
  created_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects (owner_id);

create table public.widget_configs (
  project_id uuid primary key references public.projects (id) on delete cascade,
  button_color text not null default '#111111',
  position text not null default 'bottom-right'
    check (position in ('bottom-right', 'bottom-left', 'top-right', 'top-left')),
  label text not null default 'Chat',
  animation text not null default 'fade' check (animation in ('fade', 'slide', 'scale')),
  header_text text not null default 'Askwell',
  show_badge boolean not null default true
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  type text not null check (type in ('text', 'pdf', 'md', 'txt')),
  storage_key text,
  status text not null default 'uploading'
    check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

create index knowledge_sources_project_id_idx on public.knowledge_sources (project_id);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  content text not null,
  embedding extensions.vector(1536)
);

create index knowledge_chunks_project_id_idx on public.knowledge_chunks (project_id);
create index knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  visitor_id text not null,
  created_at timestamptz not null default now()
);

create index conversations_project_id_idx on public.conversations (project_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('visitor', 'bot')),
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages (conversation_id);

-- Functions -------------------------------------------------------------------

-- The two RLS helpers are the only SECURITY DEFINER functions: they read rows
-- the caller may not read directly, so that the policies can scope them.
-- Every other function runs as its caller.
create or replace function public.owned_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.projects p
  where p.owner_id = (auth.jwt() ->> 'sub');
$$;

create or replace function public.owned_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.conversations c
  where c.project_id in (select public.owned_project_ids());
$$;

-- The dashboard numbers. It runs as the caller, so RLS scopes the counts to
-- the rows the owner may see.
create or replace function public.owner_activity()
returns table (projects bigint, conversations bigint, messages bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*) from public.projects),
    (select count(*) from public.conversations),
    (select count(*) from public.messages);
$$;

-- Row level security ----------------------------------------------------------
--
-- The owner is auth.jwt() ->> 'sub', the Clerk user id. The auth schema
-- belongs to Supabase, which grants the API roles access to it.

alter table public.accounts enable row level security;
alter table public.projects enable row level security;
alter table public.widget_configs enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- The owner reads their own account row.
create policy accounts_select_own
  on public.accounts
  for select
  to authenticated
  using (clerk_user_id = (auth.jwt() ->> 'sub'));

-- The owner reads, renames and deletes their own projects.
create policy projects_select_own
  on public.projects
  for select
  to authenticated
  using (owner_id = (auth.jwt() ->> 'sub'));

create policy projects_update_own
  on public.projects
  for update
  to authenticated
  using (owner_id = (auth.jwt() ->> 'sub'))
  with check (owner_id = (auth.jwt() ->> 'sub'));

create policy projects_delete_own
  on public.projects
  for delete
  to authenticated
  using (owner_id = (auth.jwt() ->> 'sub'));

create policy widget_configs_select_own
  on public.widget_configs
  for select
  to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy knowledge_sources_select_own
  on public.knowledge_sources
  for select
  to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy knowledge_chunks_select_own
  on public.knowledge_chunks
  for select
  to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy conversations_select_own
  on public.conversations
  for select
  to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy messages_select_own
  on public.messages
  for select
  to authenticated
  using (conversation_id in (select public.owned_conversation_ids()));

-- Grants ----------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

-- The owner reads their own rows, renames their projects and deletes them.
grant select on public.accounts to authenticated;
grant select on public.projects to authenticated;
grant update (name) on public.projects to authenticated;
grant delete on public.projects to authenticated;
grant select on public.widget_configs to authenticated;
grant select on public.knowledge_sources to authenticated;
grant select on public.knowledge_chunks to authenticated;
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;

-- The server does everything.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- A visitor gets nothing: no table, no function.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- TRUNCATE is never available through the Data API.
revoke truncate on all tables in schema public from anon, authenticated, service_role;

-- Functions are not executable by default. Only the roles that need them get
-- them, and every function in this schema has search_path = ''.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.owned_project_ids () to authenticated;
grant execute on function public.owned_conversation_ids () to authenticated;
grant execute on function public.owner_activity () to authenticated;
