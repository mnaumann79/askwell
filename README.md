# Askwell

An AI support chat widget for any website. A business adds its product info, copies one
`<script>` tag, and gets a chat bot that answers visitor questions from that info.

`docs/project.md` is the source of truth for what we build, `docs/plan.md` for the order we
build it in.

## Requirements

| Tool | Version                                          |
| ---- | ------------------------------------------------ |
| Node | 22 or newer (`engines.node`)                     |
| pnpm | 10 (`packageManager` in the root `package.json`) |

With Node 22 installed, pnpm comes with corepack:

```bash
corepack enable && corepack prepare pnpm@10 --activate
```

## Install

```bash
pnpm install
```

## Run

```bash
pnpm dev
```

Starts the web app on <http://localhost:3000>. The home page is a placeholder until the
landing page arrives.

## Checks

Every check runs from the repo root and must pass before a pull request is opened:

| Command          | Does                                       |
| ---------------- | ------------------------------------------ |
| `pnpm typecheck` | Type checks every package (`tsc --noEmit`) |
| `pnpm lint`      | Lints every package (ESLint, flat config)  |
| `pnpm test`      | Runs the tests of every package (Vitest)   |
| `pnpm build`     | Builds every package                       |
| `pnpm format`    | Formats the source with Prettier           |

`pnpm vitest run` at the repo root runs the tests of all packages in one go.

## Layout

```
apps/
  web/            # Next.js: landing, dashboard, /embed, /api
  widget/         # vanilla TS loader → dist/widget.js
packages/
  shared/         # contract: app name, types, API shapes, plan limits
  db/             # generated Supabase types (types.ts) + pglite test helper
supabase/
  migrations/     # SQL migrations (Supabase CLI)
docs/
  project.md      # what we build
  plan.md         # in what order
```

Package names are `@askwell/<name>`: `@askwell/web`, `@askwell/widget`, `@askwell/shared`,
`@askwell/db`.

## The widget

The loader runs on the customer's own website, so it is bundled into a single file that has
to stay under 5 kb:

```bash
pnpm --filter @askwell/widget build   # writes dist/widget.js and checks its size
pnpm --filter @askwell/widget check:size
```

The size check fails the build when the bundle grows over the limit.

## Environment variables

Every variable the app needs is listed in `.env.example`, grouped by service and with the
place it is read in. Copy it to `.env` and fill in the values for your environment. `.env`
is never committed.

`pnpm db:types` regenerates `packages/db/types.ts` from the Supabase dev project. It needs
the Supabase CLI and a `SUPABASE_ACCESS_TOKEN` with the `database_read` scope. The dev
project does not exist yet, so the script is wired but not run.
