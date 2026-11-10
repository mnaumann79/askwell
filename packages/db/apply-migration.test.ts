import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigration } from "./scripts/apply-migration.mjs";
import { closeTestDb, createTestDb, query, stubSupabaseRoles } from "./supabase-pglite";

const execFileAsync = promisify(execFile);

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(packageDir, "..", "..");
const migrationsDirectory = path.join(repoRoot, "supabase", "migrations");

/**
 * A migration that is on main, and whose SQL carries `$$` — the dollar-quote tag
 * the script uses has to survive that.
 */
const VERSION = "20261110035018";
const FILE = `${VERSION}_plan_refusal_sqlstate.sql`;
const NAME = "plan_refusal_sqlstate";

const DEV = "wpvdyclozjjnghrcafpf";

const PROJECTS = {
  dev: { ref: DEV, allow: ["migrations:agent", "types:agent"] },
};

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await stubSupabaseRoles(db);

  // The platform owns this schema and table on a real project, so the test
  // creates them: the statement has to have something to insert into.
  await db.exec(`
    create schema if not exists supabase_migrations;

    create table if not exists supabase_migrations.schema_migrations (
      version text not null,
      statements text[],
      name text,
      created_by text,
      idempotency_key text,
      rollback text[]
    );
  `);
});

afterAll(async () => {
  await closeTestDb(db);
});

beforeEach(async () => {
  await db.exec("delete from supabase_migrations.schema_migrations;");
});

/** The migration files, as they are on disk — the listing the script reads. */
async function listFilesFromDisk(): Promise<string[]> {
  return (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql"));
}

/** The bytes of a file on merged main — here, the bytes on disk. */
async function fetchFileFromDisk(filePath: string): Promise<Buffer> {
  return readFile(path.join(repoRoot, filePath));
}

/** How many rows are recorded on the test database. */
async function recordedCount(): Promise<number> {
  const [row] = await query(
    db,
    "select count(*)::int as n from supabase_migrations.schema_migrations",
  );

  if (!row) {
    throw new Error("the count query returned nothing");
  }

  return Number(row.n);
}

/** Runs a statement against the test database. The ref is not used. */
function queryPglite() {
  return async (_ref: string, sql: string) => query(db, sql);
}

function apply(overrides: Partial<Parameters<typeof applyMigration>[0]> = {}) {
  return applyMigration({
    projects: PROJECTS,
    version: VERSION,
    listFiles: listFilesFromDisk,
    fetchFile: fetchFileFromDisk,
    query: queryPglite(),
    ...overrides,
  });
}

describe("apply-migration", () => {
  describe("the project it writes to", () => {
    it("records the row the platform records: the version, the name and the file's bytes", async () => {
      const result = await apply();

      if (!result.ok) {
        throw new Error(`expected the apply to succeed: ${result.message}`);
      }

      expect(result.ref).toBe(DEV);
      expect(result.version).toBe(VERSION);
      expect(result.name).toBe(NAME);

      const rows = await query(
        db,
        "select version, name, md5(statements[1]) as stmt_md5, octet_length(statements[1]) as stmt_bytes " +
          "from supabase_migrations.schema_migrations",
      );

      const [row] = rows;

      if (!row) {
        throw new Error("apply-migration recorded no row");
      }

      expect(rows).toHaveLength(1);
      expect(row.version).toBe(VERSION);
      expect(row.name).toBe(NAME);

      // The stored row holds exactly the file: its md5 is the file's md5.
      const file = await readFile(path.join(migrationsDirectory, FILE));
      expect(row.stmt_md5).toBe(createHash("md5").update(file).digest("hex"));
      expect(row.stmt_bytes).toBe(file.length);
    });

    it("refuses when no project permits the operation", async () => {
      const result = await apply({ projects: { dev: { ref: DEV, allow: [] } } });

      expect(result.ok).toBe(false);

      if (result.ok) {
        throw new Error("expected a refusal");
      }

      expect(result.reason).toBe("no-permitted-target");
      expect(result.message).toContain("migrations:agent");
    });

    it("refuses when more than one project permits it, rather than picking one", async () => {
      const result = await apply({
        projects: {
          dev: { ref: DEV, allow: ["migrations:agent"] },
          staging: { ref: "anotherref", allow: ["migrations:agent"] },
        },
      });

      expect(result.ok).toBe(false);

      if (result.ok) {
        throw new Error("expected a refusal");
      }

      expect(result.reason).toBe("ambiguous-target");
    });

    it("refuses a project that is not permitted, and does not fall back to another", async () => {
      const before = process.env.SUPABASE_PROJECT_ID;
      process.env.SUPABASE_PROJECT_ID = "ywvhvphlbmtwfrsuewsh";

      try {
        const result = await apply();

        expect(result.ok).toBe(false);

        if (result.ok) {
          throw new Error("expected a refusal");
        }

        expect(result.reason).toBe("project-not-permitted");
      } finally {
        if (before === undefined) {
          delete process.env.SUPABASE_PROJECT_ID;
        } else {
          process.env.SUPABASE_PROJECT_ID = before;
        }
      }

      // Nothing was written.
      expect(await recordedCount()).toBe(0);
    });
  });

  describe("the file it applies", () => {
    it("refuses a version that is not a version, and never a path", async () => {
      const result = await apply({ version: `supabase/migrations/${FILE}` });

      expect(result.ok).toBe(false);

      if (result.ok) {
        throw new Error("expected a refusal");
      }

      expect(result.reason).toBe("invalid-version");
    });

    it("refuses when no file on main carries the version", async () => {
      const result = await apply({ version: "19700101000000" });

      expect(result.ok).toBe(false);

      if (result.ok) {
        throw new Error("expected a refusal");
      }

      expect(result.reason).toBe("no-such-migration");
    });

    it("refuses a file whose hash is not the expected one", async () => {
      const result = await apply({ expectSha256: "0".repeat(64) });

      expect(result.ok).toBe(false);

      if (result.ok) {
        throw new Error("expected a refusal");
      }

      expect(result.reason).toBe("wrong-hash");

      // The refusal is a gate: nothing was written.
      expect(await recordedCount()).toBe(0);
    });

    it("accepts a file whose hash is the expected one", async () => {
      const file = await readFile(path.join(migrationsDirectory, FILE));
      const sha256 = createHash("sha256").update(file).digest("hex");

      const result = await apply({ expectSha256: sha256 });

      if (!result.ok) {
        throw new Error(`expected the apply to succeed: ${result.message}`);
      }

      expect(result.sha256).toBe(sha256);
    });
  });

  describe("the row it will not write twice", () => {
    it("refuses when the row is already there", async () => {
      await db.exec(
        `insert into supabase_migrations.schema_migrations (version, name) values ('${VERSION}', '${NAME}')`,
      );

      const result = await apply();

      expect(result.ok).toBe(false);

      if (result.ok) {
        throw new Error("expected a refusal");
      }

      expect(result.reason).toBe("row-exists");

      // Still one row: a duplicate trigger does not double-apply.
      expect(await recordedCount()).toBe(1);
    });
  });
});

describe("db-types", () => {
  it("refuses a project that is not permitted for reading types", async () => {
    const before = process.env.SUPABASE_PROJECT_ID;
    process.env.SUPABASE_PROJECT_ID = "ywvhvphlbmtwfrsuewsh";

    try {
      await expect(
        execFileAsync("node", [path.join(packageDir, "scripts", "db-types.mjs")], {
          env: { ...process.env, SUPABASE_PROJECT_ID: "ywvhvphlbmtwfrsuewsh" },
        }),
      ).rejects.toThrow(/not permitted for types:agent/);
    } finally {
      if (before === undefined) {
        delete process.env.SUPABASE_PROJECT_ID;
      } else {
        process.env.SUPABASE_PROJECT_ID = before;
      }
    }
  });
});
