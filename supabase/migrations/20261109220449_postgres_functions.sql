-- The five functions that own the plan limits, the message quota and the
-- retrieval (docs/project.md §7).
--
-- Only service_role may execute them. The plan limits arrive as parameters
-- from PLAN_LIMITS in @askwell/shared: no limit is written down here.
--
-- The three that count - create_project, reserve_knowledge_source and
-- consume_message - check and write under a row lock, so two concurrent
-- requests cannot both pass the limit.
--
-- The SQLSTATEs the functions raise, so a route can tell them apart:
--   PT001  the plan does not allow another project
--   PT002  the plan does not allow another knowledge source
--   PT003  the plan does not allow another message this month
--   PT004  there is no account or no project for the caller

-- Creates a project with its public key and its default widget config.
--
-- The widget config values come from DEFAULT_WIDGET_CONFIG in
-- @askwell/shared and are passed in, so they are written here and never
-- defaulted in SQL.
create or replace function public.create_project(
  p_owner_id text,
  p_name text,
  p_max_projects integer,
  p_widget_config jsonb
)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project public.projects;
  v_projects bigint;
begin
  -- Lock the account row, so a second request for the same owner waits here
  -- and counts the project the first one created.
  perform 1
  from public.accounts
  where clerk_user_id = p_owner_id
  for update;

  if not found then
    raise exception 'no account for owner %', p_owner_id using errcode = 'PT004';
  end if;

  select count(*)
  into v_projects
  from public.projects
  where owner_id = p_owner_id;

  if v_projects >= p_max_projects then
    raise exception 'project limit reached for plan' using errcode = 'PT001';
  end if;

  insert into public.projects (owner_id, name, public_key)
  values (p_owner_id, p_name, 'pk_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into v_project;

  insert into public.widget_configs (
    project_id,
    button_color,
    position,
    label,
    animation,
    header_text,
    show_badge
  )
  values (
    v_project.id,
    p_widget_config ->> 'buttonColor',
    p_widget_config ->> 'position',
    p_widget_config ->> 'label',
    p_widget_config ->> 'animation',
    p_widget_config ->> 'headerText',
    (p_widget_config ->> 'showBadge')::boolean
  );

  return v_project;
end;
$$;

-- Reserves a knowledge source and counts it against the limit. The source
-- starts as 'uploading' and is claimed by the finalize route.
create or replace function public.reserve_knowledge_source(
  p_project_id uuid,
  p_title text,
  p_type text,
  p_storage_key text,
  p_max_sources integer
)
returns public.knowledge_sources
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.knowledge_sources;
  v_sources bigint;
begin
  -- Lock the project row, so a second request waits here and counts the
  -- source the first one reserved.
  perform 1
  from public.projects
  where id = p_project_id
  for update;

  if not found then
    raise exception 'no project %', p_project_id using errcode = 'PT004';
  end if;

  -- Uploaded files and pasted text count together.
  select count(*)
  into v_sources
  from public.knowledge_sources
  where project_id = p_project_id;

  if v_sources >= p_max_sources then
    raise exception 'knowledge source limit reached for plan' using errcode = 'PT002';
  end if;

  insert into public.knowledge_sources (project_id, title, type, storage_key, status)
  values (p_project_id, p_title, p_type, p_storage_key, 'uploading')
  returning * into v_source;

  return v_source;
end;
$$;

-- Counts one message against the monthly quota.
--
-- The message is counted before the model call and is never refunded, so a
-- failed model call still uses one message.
create or replace function public.consume_message(
  p_project_id uuid,
  p_max_messages integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project public.projects;
  v_messages integer;
begin
  -- Lock the project row, so two requests cannot both pass the quota.
  select *
  into v_project
  from public.projects
  where id = p_project_id
  for update;

  if not found then
    raise exception 'no project %', p_project_id using errcode = 'PT004';
  end if;

  -- The quota resets with the month.
  if v_project.period_start < date_trunc('month', now()) then
    update public.projects
    set messages_used = 0,
        period_start = date_trunc('month', now())
    where id = p_project_id;

    v_project.messages_used := 0;
  end if;

  if v_project.messages_used >= p_max_messages then
    raise exception 'message quota reached for plan' using errcode = 'PT003';
  end if;

  update public.projects
  set messages_used = messages_used + 1
  where id = p_project_id
  returning messages_used into v_messages;

  return v_messages;
end;
$$;

-- Writes the visitor message and the bot reply. The first message of a
-- visitor creates the conversation.
create or replace function public.save_chat_turn(
  p_conversation_id uuid,
  p_project_id uuid,
  p_visitor_id text,
  p_visitor_message text,
  p_bot_reply text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation_id uuid;
begin
  if p_conversation_id is null then
    insert into public.conversations (project_id, visitor_id)
    values (p_project_id, p_visitor_id)
    returning id into v_conversation_id;
  else
    -- The conversation id comes from the visitor, and this function runs as
    -- service_role, so RLS cannot catch a conversation of another project.
    select id
    into v_conversation_id
    from public.conversations
    where id = p_conversation_id
      and project_id = p_project_id;

    if not found then
      raise exception 'conversation % does not belong to project %', p_conversation_id, p_project_id
        using errcode = 'PT004';
    end if;
  end if;

  insert into public.messages (conversation_id, role, body)
  values (v_conversation_id, 'visitor', p_visitor_message);

  insert into public.messages (conversation_id, role, body)
  values (v_conversation_id, 'bot', p_bot_reply);

  return v_conversation_id;
end;
$$;

-- The chunks of one project that match the question best.
--
-- The project is a parameter, so the search cannot reach another project.
create or replace function public.match_chunks(
  p_project_id uuid,
  p_embedding extensions.vector(1536),
  p_match_count integer
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  distance double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.source_id,
    c.content,
    c.embedding OPERATOR(extensions.<=>) p_embedding as distance
  from public.knowledge_chunks c
  join public.knowledge_sources s on s.id = c.source_id
  where c.project_id = p_project_id
    and s.status = 'ready'
  order by c.embedding OPERATOR(extensions.<=>) p_embedding
  limit p_match_count;
$$;

-- Grants ----------------------------------------------------------------------

-- Only the server may run these functions.
revoke execute on function public.create_project(text, text, integer, jsonb)
  from public, anon, authenticated;
revoke execute on function public.reserve_knowledge_source(uuid, text, text, text, integer)
  from public, anon, authenticated;
revoke execute on function public.consume_message(uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.save_chat_turn(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.match_chunks(uuid, extensions.vector, integer)
  from public, anon, authenticated;

grant execute on function public.create_project(text, text, integer, jsonb) to service_role;
grant execute on function public.reserve_knowledge_source(uuid, text, text, text, integer)
  to service_role;
grant execute on function public.consume_message(uuid, integer) to service_role;
grant execute on function public.save_chat_turn(uuid, uuid, text, text, text) to service_role;
grant execute on function public.match_chunks(uuid, extensions.vector, integer) to service_role;

-- A function nobody may execute is the default from now on. A function that
-- needs one gets it in the migration that creates it.
alter default privileges in schema public revoke execute on functions from public;
