# Runbook

How to recognise, measure and answer the failures we hit on the Supabase Data API.

Every number here was measured on **askwell-dev** (`wpvdyclozjjnghrcafpf`) on **2026-11-10**, four times
over in four sandboxes — Jim's (the run behind PR #12), Dwight's, and the lead's twice (behind PR #12's
comment and again today) — byte for byte identical.

---

## 1. The Data API 502 on a raised SQLSTATE

A Postgres function that raises one of our custom `PT00x` SQLSTATEs comes back from the Data API as a
**502** the route cannot read. There is no JSON error body, so `error.code`, `error.message`,
`error.hint` and `error.details` are all `undefined` in `supabase-js`.

### 1.1 What it looks like

| Fact                      | Value                                                                          |
| ------------------------- | ------------------------------------------------------------------------------ |
| status                    | `502`                                                                          |
| `content-type`            | `text/plain`                                                                   |
| body                      | **110 bytes**, no trailing newline                                             |
| body sha256               | `f8ad80965ef3d2fb9ad4a3ea49272c02172d9f299cdedb418bb811988e007545`             |
| body sha256, with newline | `bd57d9ab928105af34afba716adfa07e42091ac164f5940d9b7afc9aefca152b` (111 bytes) |
| error fields              | none — no `code`, no `message`, no `hint`, no `details`                        |
| `sb-gateway-version`      | `1`                                                                            |
| `sb-project-ref`          | `wpvdyclozjjnghrcafpf`                                                         |
| `x-envoy-attempt-count`   | `6`                                                                            |

The body is the gateway's own plain text:

```
upstream connect error or disconnect/reset before headers. retried and the latest reset reason: protocol error
```

**The length is measured, never declared.** The 502 carries **no `content-length` header at all**:

- over **HTTP/2** the body ends with the stream — HTTP/2 has no chunking, so there is nothing to count
  it with;
- over **HTTP/1.1** it comes back `Transfer-Encoding: chunked`, so the bytes are chunked, not counted.

So the body length comes from `wc -c` or `curl -w '%{size_download}'`, never from a header.

### 1.2 How to recognise it

**Two listings can never be byte-identical.** Some header lines are per request and change every time;
the rest are invariant. Compare only the invariant lines.

| Line                                   | Per request or invariant |
| -------------------------------------- | ------------------------ |
| `502`                                  | invariant                |
| `content-type: text/plain`             | invariant                |
| `sb-gateway-version: 1`                | invariant                |
| `sb-project-ref: wpvdyclozjjnghrcafpf` | invariant                |
| `x-envoy-attempt-count: 6`             | invariant                |
| the 110-byte body and its sha256       | invariant                |
| `cf-ray`                               | per request              |
| `sb-request-id`                        | per request              |
| `set-cookie`                           | per request              |
| `date`                                 | per request              |

**The CONNECT trap.** A raw header dump carries **two** status lines:

```
HTTP/1.0 200 Connection established
HTTP/2 502
```

The first is the sandbox egress proxy's reply to the `CONNECT`, not the app's answer. **Only the second
status line is the app's.** `curl`'s `%{http_code}` reports the app's response, so a number taken that
way is right.

**The control.** `match_chunks` — a `stable` function that only selects, raises nothing and writes
nothing — answers **200** with `[]` and `x-envoy-attempt-count: 1` through the same gateway, the same
key and the same project. Run it when you see the 502: if the control is 200, the 502 comes from the
raise, and from nothing else.

### 1.3 How to measure it

The URL arrives in the sandbox **wrapped in double quotes** — 42 bytes with the quotes, 40 without. Built
straight into a URL, `curl` refuses it:

```
curl: (3) URL rejected: Port number was not a decimal number between 0 and 65535
```

Strip the quotes first.

```bash
# The quoted values first: the URL is 42 bytes with the quotes, 40 without.
URL="$(printenv NEXT_PUBLIC_SUPABASE_URL | tr -d '"')"
KEY="$(printenv SUPABASE_SECRET_KEY | tr -d '"')"

# The call that raises one of our custom SQLSTATEs.
# -o writes the body to a file, -w prints the status and the body size.
curl -sS -o body.bin -w '%{http_code} %{size_download}\n' \
  -D headers.txt \
  -X POST "$URL/rest/v1/rpc/create_project" \
  -H "apikey: $KEY" \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  --data-binary '{"p_owner_id":"nope-does-not-exist","p_name":"probe","p_max_projects":1,"p_widget_config":{}}'

# The length is measured, never declared: no content-length header is sent.
wc -c < body.bin
sha256sum body.bin

# The control: the same key and the same project, a function that raises nothing.
EMBEDDING="$(python3 -c 'import json; print(json.dumps([0.0] * 1536))')"
curl -sS -o control.bin -w '%{http_code} %{size_download}\n' \
  -X POST "$URL/rest/v1/rpc/match_chunks" \
  -H "apikey: $KEY" \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  --data-binary "{\"p_project_id\":\"00000000-0000-0000-0000-000000000000\",\"p_embedding\":$EMBEDDING,\"p_match_count\":1}"
```

For the raised SQLSTATE the first command answers `502 110`, and `sha256sum body.bin` prints
`f8ad80965ef3d2fb9ad4a3ea49272c02172d9f299cdedb418bb811988e007545`. The control answers `200 2`.

`headers.txt` holds both status lines — the `HTTP/1.0 200 Connection established` of the proxy and the
app's answer below it.

**The deployed functions.** A file can say one thing and the database another; `prosrc` cannot. This counts
the raises, the SQLSTATEs and the hints off the functions that are deployed on dev, not off a migration
file:

```sql
select p.proname,
       (select count(*)
          from unnest(string_to_array(p.prosrc, chr(10))) l
         where l like '%raise exception%') as raises,
       h.codes,
       h.hints
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral (
    select (select array_agg(distinct m[1])
              from regexp_matches(p.prosrc, 'errcode = ''([A-Z0-9]+)''', 'g') m) as codes,
           (select array_agg(distinct m[1])
              from regexp_matches(p.prosrc, 'hint = ''([^'']+)''', 'g') m) as hints
  ) h
 where n.nspname = 'public'
   and p.proname in ('create_project', 'reserve_knowledge_source', 'consume_message', 'save_chat_turn', 'match_chunks')
 order by p.proname
```

Run it against askwell-dev — `execute_sql` of the Supabase MCP, or the SQL editor. It answers:

| `proname`                  | `raises` | `codes`   | `hints`                                         |
| -------------------------- | -------- | --------- | ----------------------------------------------- |
| `consume_message`          | 2        | `{P0001}` | `{no_account_or_project, quota_exceeded}`       |
| `create_project`           | 2        | `{P0001}` | `{no_account_or_project, plan_limit_projects}`  |
| `match_chunks`             | 0        | —         | —                                               |
| `reserve_knowledge_source` | 2        | `{P0001}` | `{no_account_or_project, plan_limit_knowledge}` |
| `save_chat_turn`           | 1        | `{P0001}` | `{no_conversation}`                             |

Seven raises, every one of them `P0001`, and the five hint tokens of §1.5 are all in there. `match_chunks`
raises nothing — that is what makes it the control in §1.2.

**Who may execute them.** A refusal is called by the route with the service key, so `service_role` is the only
role that may execute it — the visitor must not be able to call the function that refuses them. The check has
to be **per entry**, because a grant to `PUBLIC` is written with an **empty** grantee, so the entry begins
with `=`:

```sql
-- The acl of every function in public, and the grants to PUBLIC.
select p.proname,
       p.proacl::text,
       (select count(*) from unnest(p.proacl) as e where e::text like '=%') as public_entries
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 order by p.proname
```

**The obvious check lies.** `proacl::text like '%=X/%'` answers **true** for all eight functions on a
database where `PUBLIC` may execute nothing: `service_role=X/postgres` contains `=X/`. It reads as "PUBLIC
grants execute: 8 of 8" — the opposite of the truth — and a check that is wrong on every row is worse than no
check, because it looks like a result. The per-entry check needs the explicit `e::text`: `aclitem` does not
cast to text implicitly.

The eight functions answer two ACLs, and every one of them has an explicit, non-null `proacl` — the default
for a function is EXECUTE to `PUBLIC`, so this is the exception and not the default:

| Functions                                                                                         | `proacl`                                                                 | `PUBLIC` entries |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------- |
| `create_project`, `reserve_knowledge_source`, `consume_message`, `save_chat_turn`, `match_chunks` | `{postgres=X/postgres,service_role=X/postgres}`                          | 0                |
| `owned_project_ids`, `owned_conversation_ids`, `owner_activity`                                   | `{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}` | 0                |

The second row is the deliberate exception (docs/project.md §9: SECURITY INVOKER everywhere, DEFINER only for
the RLS helpers): `authenticated` may execute those three, because the policies call the helpers and a policy
runs with the privileges of the querying role.

### 1.4 What it means

PostgREST picks the HTTP status from the **SQLSTATE** of the error:

| SQLSTATE       | HTTP status                                                        |
| -------------- | ------------------------------------------------------------------ |
| `P0001`        | **400** — exact entry; the code, message, details and hint survive |
| `P0xx` (other) | 500                                                                |
| `PT<status>`   | the digits after `PT` **are** the status (`PT402` → 402)           |
| `PGRST…`       | its own codes (`PGRST202` → 404)                                   |
| anything else  | 400                                                                |

`PT001` means status **1**, and HTTP statuses run from 100 to 599 — so the status does not exist and the
response cannot be delivered. The API gateway answers **502 "upstream connect error or
disconnect/reset before headers"** after six attempts (`x-envoy-attempt-count: 6`), with the reset reason
**"protocol error"**: the upstream sent a status line the gateway could not parse.

This is **not** the `PT` branch falling back to 500. That fallback only fills in when the digits cannot be
parsed as a number at all — and `"001"` parses as `1`, so the impossible status is sent instead. A 500
would have been returned to the client with the code in the body, and we would have seen it.

The consequence for a route: every refusal built on a raised SQLSTATE — the project limit, the knowledge
limit, the message quota — answers **500** instead of 402/409/429, and the route can never map the
refusal it was written to map.

### 1.5 What to do

1. **Confirm it is this failure.** Run the control (§1.3). Control 200 + call 502 → the raise is the
   cause. Control 502 → something else, keep looking.
2. **Measure it** (§1.3): status, `content-type`, body length, sha256. Write the numbers down; the
   invariant lines are what you compare against the table in §1.1.
3. **Never raise a `PT` code whose digits are not a valid HTTP status.** `PT001`, `PT002`, `PT003` and
   `PT004` are all undeliverable.
4. **Raise `P0001`** and carry the machine-readable reason in the `hint`. `P0001` is the SQLSTATE of a
   deliberate raise; PostgREST maps it to 400 and hands the four fields through. The hint tokens are:
   `plan_limit_projects`, `plan_limit_knowledge`, `quota_exceeded`, `no_account_or_project`,
   `no_conversation`.
5. **Map the hint in the route** to the shared contract's error codes (`packages/shared/src/api/errors.ts`):
   the two plan limits → 409 `conflict`, the quota → 429 `quota_exceeded`, the conversation of another
   project → 404 `not_found`, everything else → 500 `internal_error`. The 400 the Data API answers is
   never passed on; the route builds its own answer from the hint. Treat the hint as a closed set.
6. **Grant the refusal to `service_role` only.** The route calls it with the service key. `PUBLIC` and `anon`
   must not be able to execute it, and the grant belongs in the migration that creates the function, with
   `alter default privileges in schema public revoke execute on functions from public` keeping the default away
   from everything after it. Check it with the per-entry query in §1.3, not with the one that lies.

**The after-shape, measured.** The _after_ side — the same call, the same project, the same service key, the
same body — answers **400** once the refusals raise `P0001`:

| Fact                    | Value                                                              |
| ----------------------- | ------------------------------------------------------------------ |
| status                  | `400`                                                              |
| `content-type`          | `application/json; charset=utf-8`                                  |
| body                    | **103 bytes**, no trailing newline                                 |
| body sha256             | `0d5b382837fc047f5afd931a42bee7c6174e290ad5b529cf419555ea082e5b8f` |
| `code`                  | `P0001`                                                            |
| `hint`                  | `plan_limit_projects`                                              |
| `details`               | `null`                                                             |
| `x-envoy-attempt-count` | `1`                                                                |

The body is JSON and it parses — all four fields are there. It is **one line**, and the 103 bytes and the
sha256 are exactly that line:

```
{"code":"P0001","details":null,"hint":"plan_limit_projects","message":"project limit reached for plan"}
```

`proxy-status: PostgREST; error=P0001` is PostgREST naming the SQLSTATE itself, and **one** attempt where
the before-shape needed six: the answer is deliverable now, so the gateway never has to retry it. The
`hint` is read off the response, not assumed — it is what tells the project-limit refusal from the
`no_account_or_project` one.

Measured on askwell-dev on 2026-11-10, after `20261110024949` and `20261110035018` were applied to it. The
bytes and the sha256 are in [PR #12's comment](https://github.com/mnaumann79/askwell/pull/12#issuecomment-6773484242).

---

## 2. Where these facts live

| Fact                                                         | Where                                                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| The refusals now raise `P0001` with the reason in the `hint` | `supabase/migrations/20261110035018_plan_refusal_sqlstate.sql`                                                    |
| The measured facts, carried in a migration's comment         | the file P1F-T12 produces, `20261110130500_plan_refusal_comment_correction.sql` (PR #14)                          |
| The 502 body is 110 bytes, not empty                         | this runbook (§1.1) — see below                                                                                   |
| The after-shape: 400, `application/json`, 103 bytes          | this runbook (§1.5) and [PR #12's comment](https://github.com/mnaumann79/askwell/pull/12#issuecomment-6773484242) |
| What the deployed functions raise                            | this runbook (§1.3) — the `prosrc` query                                                                          |

The merged migration `20261110035018_plan_refusal_sqlstate.sql` still says "empty body" in three places.
A merged migration is never edited, so it stays wrong on purpose and this runbook is the correction.
