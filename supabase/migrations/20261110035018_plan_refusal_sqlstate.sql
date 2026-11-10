-- The plan refusals have to survive the Data API.
--
-- A function that raises one of our custom `PT00x` SQLSTATEs comes back from
-- the Data API as a 502 with an empty body and no error code, so the route
-- never sees the refusal and cannot map it to 402, 409 or 429. Measured on
-- askwell-dev on 2026-11-10:
--
--   PGRST202 (never enters a function)          404, the code is intact
--   22P02 (cast before the body runs)            400, the code is intact
--   42501 (privilege check, before entry)        401, the code is intact
--   23514 (a check violation inside the body)    400, the code is intact
--   23502 (a not-null violation inside the body) 400, the code is intact
--   PT001 / PT002 / PT003 / PT004                502, empty body, no code
--
-- So the SQLSTATE is what matters, not the place the exception is raised:
-- PostgREST picks the HTTP status from the SQLSTATE of the error. It has an
-- exact entry for `P0001` - 400, the default code for a raise - and a branch
-- for the class `PT` where **the digits after `PT` are the HTTP status**:
-- `PT001` means status 1, `PT402` means 402. `PT001` is not a status that
-- exists - HTTP statuses run from 100 to 599 - so the response cannot be
-- delivered, and the API gateway answers 502 "upstream connect error or
-- disconnect/reset before headers" with an empty body and no code. That 502
-- carries `x-envoy-attempt-count: 6`, so the upstream was retried six times
-- before the connection was reset.
--
-- The refusals therefore raise `P0001`, which is the SQLSTATE of a deliberate
-- raise. PostgREST maps it to 400 and hands the code, the message, the
-- details and the hint through: the code is the SQLSTATE, the message is the
-- raise text, the details are the DETAIL and the hint is the HINT.
--
-- The machine-readable reason rides in the `hint`:
--
--   plan_limit_projects      the plan does not allow another project
--   plan_limit_knowledge     the plan does not allow another knowledge source
--   quota_exceeded           the plan does not allow another message this month
--   no_account_or_project    there is no account or no project for the caller
--
-- The route maps the hint to the error code of the shared contract
-- (packages/shared/src/api/errors.ts): the two plan limits answer 409
-- (conflict), the quota answers 429 (quota_exceeded) and the missing account
-- or project answers 500 (internal_error). The 400 the Data API answers is
-- never passed on: the route builds its own answer from the hint.
--
-- Nothing else changes. The signatures and the return types stay the same, so
-- this is a plain `create or replace`: no drop, no rename, and the grants stay
-- as they are, because CREATE OR REPLACE keeps the ACL of the function. The
-- row locks and the atomic checks stay exactly as they are; only the way the
-- refusal travels changes.

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
