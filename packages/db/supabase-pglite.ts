import { PGlite } from "@electric-sql/pglite";

/**
 * pglite test database (docs/project.md §3).
 *
 * Migrations, policies and functions are tested against a real Postgres that
 * runs in process. There is no local Supabase stack and no Docker database.
 *
 * Phase 0 only boots an empty database. Stubbing the Supabase roles
 * (`anon`, `authenticated`, `service_role`) and running the migrations from
 * `supabase/migrations` arrive with the first migration in Phase 1.
 */

/** Boots an empty in-memory Postgres. */
export async function createTestDb(): Promise<PGlite> {
  return new PGlite();
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

/** Closes the database and releases its resources. */
export async function closeTestDb(db: PGlite): Promise<void> {
  await db.close();
}
