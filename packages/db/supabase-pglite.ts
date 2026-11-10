import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

/**
 * pglite test database (docs/project.md §3).
 *
 * Migrations, policies and functions are tested against a real Postgres that
 * runs in process. There is no local Supabase stack and no Docker database.
 */

/** The roles the Supabase Data API connects as (docs/project.md §7). */
export type SupabaseRole = "anon" | "authenticated" | "service_role";

const migrationsDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "supabase",
  "migrations",
);

/** Boots an in-memory Postgres with the pgvector extension loaded. */
export async function createTestDb(): Promise<PGlite> {
  return new PGlite({ extensions: { vector } });
}

/** Runs a query and returns its rows. */
export async function query<T extends Record<string, unknown>>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await db.query<T>(sql, params);
  return result.rows;
}

/**
 * Runs a batch of statements and returns the rows of the last one.
 *
 * The Management API runs a multi-statement string as one batch and hands back the
 * last statement's result. `exec` uses the same simple-query protocol, so a test can
 * assert on the result of the statement that matters — the insert that records a
 * migration, not a statement read afterwards.
 */
export async function queryBatch<T extends Record<string, unknown>>(
  db: PGlite,
  sql: string,
): Promise<T[]> {
  const results = await db.exec(sql);
  const last = results[results.length - 1];

  if (!last) {
    throw new Error("the batch returned no result");
  }

  return last.rows as T[];
}

/** Closes the database and releases its resources. */
export async function closeTestDb(db: PGlite): Promise<void> {
  await db.close();
}

/**
 * Creates the roles and the auth schema that Supabase provides.
 *
 * A plain Postgres has neither, so the migration cannot run without them.
 * `auth.jwt()` returns the claims of the current request, the way Supabase
 * exposes them: the owner is `auth.jwt() ->> 'sub'`, which is the Clerk user
 * id.
 */
export async function stubSupabaseRoles(db: PGlite): Promise<void> {
  await db.exec(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin noinherit;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin noinherit;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin noinherit bypassrls;
      end if;
    end
    $$;

    create schema if not exists auth;

    create or replace function auth.jwt()
    returns jsonb
    language sql
    stable
    as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;

    -- Supabase grants the API roles access to the auth schema, so the
    -- policies can call auth.jwt().
    grant usage on schema auth to anon, authenticated, service_role;
  `);
}

/** Applies every migration in supabase/migrations, oldest first. */
export async function applyMigrations(db: PGlite): Promise<string[]> {
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    await db.exec(await readFile(path.join(migrationsDirectory, file), "utf8"));
  }

  return files;
}

/** Sets the JWT claims of the current session, the way the Data API does. */
export async function setClaims(db: PGlite, claims: Record<string, unknown>): Promise<void> {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
}

/**
 * Acts as one of the API roles, with the given claims.
 *
 * The claims go into `request.jwt.claims`, so `auth.jwt()` returns them. An
 * authenticated caller passes its Clerk user id as `sub`.
 */
export async function actAs(
  db: PGlite,
  role: SupabaseRole,
  claims: Record<string, unknown> = {},
): Promise<void> {
  await db.exec("reset role");
  await setClaims(db, { ...claims, role });
  await db.exec(`set role ${role}`);
}
