-- The RLS policies evaluate auth.jwt() per row, and the foreign key
-- knowledge_chunks.source_id has no index of its own.
--
-- Postgres evaluates a function in a policy expression once per row. Wrapping
-- the call in a scalar subquery - (select auth.jwt()) - turns it into an
-- InitPlan that is evaluated once per query instead (docs/project.md §7, §9).
--
-- The four policies below are the ones that call auth.jwt() directly. Each one
-- is dropped and recreated with the same expression, the same role and the
-- same with check; the only difference is the select wrapper. The policies
-- that read through the helpers (owned_project_ids, owned_conversation_ids)
-- are not part of this and are left alone, and so are the helpers themselves:
-- they are the only SECURITY DEFINER functions, and §9 says leave them.
--
-- Postgres does not index the referencing side of a foreign key, so deleting a
-- knowledge source has to scan knowledge_chunks. The index fixes that, and it
-- changes no behaviour.

-- The owner reads their own account row.
drop policy accounts_select_own on public.accounts;

create policy accounts_select_own
  on public.accounts
  for select
  to authenticated
  using (clerk_user_id = ((select auth.jwt()) ->> 'sub'));

-- The owner reads, renames and deletes their own projects.
drop policy projects_select_own on public.projects;

create policy projects_select_own
  on public.projects
  for select
  to authenticated
  using (owner_id = ((select auth.jwt()) ->> 'sub'));

drop policy projects_update_own on public.projects;

create policy projects_update_own
  on public.projects
  for update
  to authenticated
  using (owner_id = ((select auth.jwt()) ->> 'sub'))
  with check (owner_id = ((select auth.jwt()) ->> 'sub'));

drop policy projects_delete_own on public.projects;

create policy projects_delete_own
  on public.projects
  for delete
  to authenticated
  using (owner_id = ((select auth.jwt()) ->> 'sub'));

-- The referencing side of the foreign key has no index of its own.
create index knowledge_chunks_source_id_idx on public.knowledge_chunks (source_id);
