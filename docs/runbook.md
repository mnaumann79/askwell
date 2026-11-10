# Runbook

How to recognise, measure and answer the failures we hit on the Supabase Data API.

Every number here was measured on **askwell-dev** (`wpvdyclozjjnghrcafpf`) on **2026-11-10**, from four
sandboxes, byte for byte identical: mine (the original run behind PR #12, repeated today), Dwight's and
Michael's.

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

**Pending measurement.** The _after_ side — that the same call answers **400** with `code: P0001` and the
`hint` — has **not** been measured yet. It waits on the migration being applied to dev (P1F-T10). Until
that number lands, the after-shape rests on PostgREST's documented behaviour, and this runbook does not
claim it as a measurement.

---

## 2. Where these facts live

| Fact                                                         | Where                                                                                    |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| The refusals now raise `P0001` with the reason in the `hint` | `supabase/migrations/20261110035018_plan_refusal_sqlstate.sql`                           |
| The measured facts, carried in a migration's comment         | the file P1F-T12 produces, `20261110130500_plan_refusal_comment_correction.sql` (PR #14) |
| The 502 body is 110 bytes, not empty                         | this runbook (§1.1) — see below                                                          |

The merged migration `20261110035018_plan_refusal_sqlstate.sql` still says "empty body" in three places.
A merged migration is never edited, so it stays wrong on purpose and this runbook is the correction.
