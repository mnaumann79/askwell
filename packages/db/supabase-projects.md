# The projects we name

`supabase-projects.json` is the one place the repo says which Supabase projects exist for
us and what each of them may be used for. The scripts in `scripts/` read it and nothing
else; a project that is not in this list is not a target.

```json
{
  "dev": {
    "ref": "wpvdyclozjjnghrcafpf",
    "allow": ["migrations:agent", "types:agent"]
  }
}
```

## The shape

Each entry is a name we use for a project, the project's ref, and the list of operations
that project is permitted for.

| Field   | What it is                                                              |
| ------- | ----------------------------------------------------------------------- |
| `ref`   | The project ref, the string in the project URL                          |
| `allow` | The operations this project may be used for. Empty means: not for us     |

## The purpose values

An operation is `<what>:<who>`.

| Value              | What it permits                                                          |
| ------------------ | ------------------------------------------------------------------------ |
| `migrations:agent` | An agent may apply a migration to this project                           |
| `types:agent`      | An agent may read this project's schema to regenerate `types.ts`          |
| `migrations:owner` | The product owner applies migrations to this project — **not an agent**   |

The prod project's entry carries `allow: []` when it exists, because the product owner
applies migrations to production before promoting the build. An empty list cannot be
widened by the list growing: the owner's actions are the owner's, and no agent script
gains that write by a second entry appearing.

**Today the types script reads dev, and the apply script writes dev.** Both resolve
their target from this file, so nobody types a project ref by hand.

## The rules the scripts follow

- **The operation is per entry.** The apply script acts only on an entry whose `allow`
  contains `migrations:agent`; the types script only on one that contains
  `types:agent`.
- **The resolution is three ways.** Exactly one entry permits the operation → it is
  used. None → the script refuses and says which operation has no permitted target.
  More than one → the script refuses and says the list is ambiguous. A silent
  fallback is the thing this file exists to prevent.
- **`SUPABASE_PROJECT_ID` can only narrow.** If it is set it must name an entry that
  already permits the operation. It can never redirect a write to another project: a
  value that names nothing permitted is a refusal, not a fallback.
- **A ref is never trusted from the environment.** The ref the script acts on is the
  one in this file.

## Why one file and not a manifest

A manifest of migration hashes would need a line per migration, would be amended every
time a file changed, and would go stale quietly — and it would fail for a reason that
has nothing to do with the bytes being applied. The expectation about a file belongs
to whoever verified it, which is why `pnpm db:apply` takes `--expect-sha256` as an
argument instead of reading a second copy of the facts out of the repo.
