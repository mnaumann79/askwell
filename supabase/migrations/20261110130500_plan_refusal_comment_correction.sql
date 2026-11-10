-- The refusals' comment was wrong about the 502, so this file corrects it.
--
-- 20261110035018 said that a raised `PT00x` SQLSTATE comes back from the Data
-- API "as a 502 with an empty body and no error code". The body is not empty.
-- It is the gateway's own plain text, 110 bytes of it, and there is no JSON in
-- it and no error code in it. That is the part a route has to know: there is
-- nothing to parse, only a status line to branch on.
--
-- Measured on askwell-dev on 2026-11-10, in three sandboxes, byte for byte:
--
--   status                 502
--   content-type           text/plain
--   sb-gateway-version     1
--   sb-project-ref         wpvdyclozjjnghrcafpf
--   x-envoy-attempt-count  6
--
-- The body, whole:
--
--   upstream connect error or disconnect/reset before headers. retried and
--   the latest reset reason: protocol error
--
-- Its sha256 is f8ad80965ef3d2fb9ad4a3ea49272c02172d9f299cdedb418bb811988e007545
-- for those 110 bytes without a trailing newline, and
-- bd57d9ab928105af34afba716adfa07e42091ac164f5940d9b7afc9aefca152b with one.
--
-- The length is measured, never declared. No header counts the body: over
-- HTTP/2 it ends with the stream, over HTTP/1.1 it is `Transfer-Encoding:
-- chunked`. There is no `content-length` in either protocol, so the 110 bytes
-- are counted off the body itself.
--
-- Why the 502 happens at all: PostgREST picks the HTTP status from the
-- SQLSTATE of the error. It has an exact entry for `P0001` - 400, the default
-- code for a raise - and a branch for the class `PT` where **the digits after
-- `PT` are the HTTP status**: `PT001` means status 1, `PT402` means 402.
-- `PT001` is not a status that exists - HTTP statuses run from 100 to 599 -
-- so the response cannot be delivered, and the gateway answers 502 after six
-- attempts (`x-envoy-attempt-count: 6`) with a reset reason of "protocol
-- error": the upstream sent a status line the gateway could not parse. A 500
-- would have been returned to the client with the code in the body, so this
-- is not that branch's fallback. The same measurement for the codes PostgREST
-- knows, where the code survives: PGRST202 (never enters a function) 404,
-- 22P02 (cast before the body runs) 400, 42501 (privilege check, before
-- entry) 401, 23514 (a check violation inside the body) 400, 23502 (a
-- not-null violation inside the body) 400.
--
-- So the refusals raise `P0001`, which is the SQLSTATE of a deliberate raise.
-- PostgREST maps it to 400 and hands the code, the message, the details and
-- the hint through: the code is the SQLSTATE, the message is the raise text,
-- the details are the DETAIL and the hint is the HINT.
--
-- The machine-readable reason rides in the `hint`:
--
--   plan_limit_projects      the plan does not allow another project
--   plan_limit_knowledge     the plan does not allow another knowledge source
--   quota_exceeded           the plan does not allow another message this month
--   no_account_or_project    there is no account or no project for the caller
--   no_conversation          the conversation belongs to another project
--
-- The route maps the hint to the error code of the shared contract
-- (packages/shared/src/api/errors.ts): the two plan limits answer 409
-- (conflict), the quota answers 429 (quota_exceeded), the missing account
-- or project answers 500 (internal_error) and the conversation of another
-- project answers 404 (not_found). The 400 the Data API answers is never
-- passed on: the route builds its own answer from the hint.
--
-- This file changes no behaviour. The four functions below are re-asserted
-- with `create or replace` and with the bodies they already have, because a
-- comment is only stored with the function it belongs to. The signatures and
-- the return types are the same, so there is no drop and no rename, and the
-- grants stay as they are, because CREATE OR REPLACE keeps the ACL of the
-- function. The row locks and the atomic checks are the same as they were.
-- The refusals travel as `P0001` since 20261110035018; this file only makes
-- the comment say what that travel looks like.

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
    raise exception 'no account for owner %', p_owner_id
      using errcode = 'P0001', hint = 'no_account_or_project';
  end if;

  select count(*)
  into v_projects
  from public.projects
  where owner_id = p_owner_id;

  if v_projects >= p_max_projects then
    raise exception 'project limit reached for plan'
      using errcode = 'P0001', hint = 'plan_limit_projects';
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
    raise exception 'no project %', p_project_id
      using errcode = 'P0001', hint = 'no_account_or_project';
  end if;

  -- Uploaded files and pasted text count together.
  select count(*)
  into v_sources
  from public.knowledge_sources
  where project_id = p_project_id;

  if v_sources >= p_max_sources then
    raise exception 'knowledge source limit reached for plan'
      using errcode = 'P0001', hint = 'plan_limit_knowledge';
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
    raise exception 'no project %', p_project_id
      using errcode = 'P0001', hint = 'no_account_or_project';
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
    raise exception 'message quota reached for plan'
      using errcode = 'P0001', hint = 'quota_exceeded';
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
        using errcode = 'P0001', hint = 'no_conversation';
    end if;
  end if;

  insert into public.messages (conversation_id, role, body)
  values (v_conversation_id, 'visitor', p_visitor_message);

  insert into public.messages (conversation_id, role, body)
  values (v_conversation_id, 'bot', p_bot_reply);

  return v_conversation_id;
end;
$$;
