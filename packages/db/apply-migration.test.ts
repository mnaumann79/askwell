import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigration, fetchFileOnMain, listFilesOnMain } from "./scripts/apply-migration.mjs";
import { closeTestDb, createTestDb, query, queryBatch, stubSupabaseRoles } from "./supabase-pglite";

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

  // Every migration but the one under test, oldest first: the tables the
  // migration's functions read have to exist, and the functions have to be the
  // ones the earlier migration left.
  for (const file of await migrationFiles()) {
    if (file === FILE) {
      continue;
    }

    await db.exec(await readFile(path.join(migrationsDirectory, file), "utf8"));
  }
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

/** The migration files on disk, oldest first. */
async function migrationFiles(): Promise<string[]> {
  return (await listFilesFromDisk()).sort();
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

/**
 * Runs a batch against the test database. The ref is not used.
 *
 * A batch is what the script sends — the migration's SQL and the insert in one
 * call — so the test runs it the same way and takes the last statement's result,
 * which is the insert's.
 */
function queryPglite() {
  return async (_ref: string, sql: string) => queryBatch(db, sql);
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
  describe("what it does to the database", () => {
    it("applies the migration, not only records it", async () => {
      // Dropped first, so the assertion cannot pass on a function an earlier
      // test left behind.
      await db.exec("drop function if exists public.create_project(text, text, integer, jsonb)");

      const gone = await query(
        db,
        "select count(*)::int as n from pg_proc where proname = 'create_project' and pronamespace = 'public'::regnamespace",
      );
      expect(gone[0]?.n).toBe(0);

      const result = await apply();

      if (!result.ok) {
        throw new Error(`expected the apply to succeed: ${result.message}`);
      }

      // The effect: the function is on the server, and the refusal it raises
      // travels as P0001 — the SQLSTATE the Data API can deliver. The earlier
      // migration raised PT004, which it cannot.
      const functions = await query(
        db,
        "select prosrc from pg_proc where proname = 'create_project' and pronamespace = 'public'::regnamespace",
      );

      expect(functions).toHaveLength(1);
      expect(functions[0]?.prosrc).toContain("errcode = 'P0001'");
      expect(functions[0]?.prosrc).toContain("hint = 'plan_limit_projects'");
      expect(functions[0]?.prosrc).not.toContain("PT004");
    });

    it("records nothing when the migration itself fails", async () => {
      const broken = {
        version: "20261110130500",
        listFiles: async () => ["20261110130500_broken.sql"],
        fetchFile: async () => Buffer.from("select 1/0;\n"),
      };

      // The batch fails as a whole, so the call rejects.
      await expect(apply(broken)).rejects.toThrow();

      // The migration and the row land together or not at all.
      expect(await recordedCount()).toBe(0);
    });
  });

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

    it("records who applied it, the way the platform's own apply does", async () => {
      const result = await apply({ createdBy: "mnaumann79@gmail.com" });

      if (!result.ok) {
        throw new Error(`expected the apply to succeed: ${result.message}`);
      }

      const rows = await query(db, "select created_by from supabase_migrations.schema_migrations");

      expect(rows).toHaveLength(1);
      expect(rows[0]?.created_by).toBe("mnaumann79@gmail.com");
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

describe("the command line", () => {
  it("prints the reason of a refusal and exits non-zero", async () => {
    // A version that is not a version is refused before anything is fetched, so
    // this command touches neither the network nor the project.
    const failure = await execFileAsync(
      "node",
      [path.join(packageDir, "scripts", "apply-migration.mjs"), "notaversion"],
      { env: { ...process.env, SUPABASE_ACCESS_TOKEN: "test-token" } },
    ).then(
      () => {
        throw new Error("expected the command to fail");
      },
      (reason: { code?: number; stderr: string }) => reason,
    );

    expect(failure.code).toBe(1);
    expect(failure.stderr).toContain("db:apply: invalid-version:");
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

describe("the repository fetches", () => {
  /** A request the stubbed fetch saw. */
  type Call = { url: string; headers: Record<string, string> };

  /** Answers every fetch with the body, and records what was asked for. */
  function stubFetch(body: string): Call[] {
    const calls: Call[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        calls.push({ url: String(url), headers: init?.headers ?? {} });

        return new Response(body, { status: 200 });
      }),
    );

    return calls;
  }

  const before = process.env.GITHUB_TOKEN;

  afterEach(() => {
    if (before === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = before;
    }

    vi.unstubAllGlobals();
  });

  it("sends the token when it fetches a file from main", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const calls = stubFetch("select 1;\n");

    const bytes = await fetchFileOnMain(
      "supabase/migrations/20261110035018_plan_refusal_sqlstate.sql",
    );

    expect(bytes.toString("utf8")).toBe("select 1;\n");
    expect(calls[0]?.headers.Authorization).toBe("Bearer test-token");
  });

  it("fetches the file through the contents API, where the listing already works", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const calls = stubFetch("select 1;\n");

    await fetchFileOnMain("supabase/migrations/20261110035018_plan_refusal_sqlstate.sql");

    expect(calls[0]?.url).toContain(
      "/contents/supabase/migrations/20261110035018_plan_refusal_sqlstate.sql?ref=main",
    );
    expect(calls[0]?.headers.Accept).toBe("application/vnd.github.raw");
  });

  it("sends the token when it lists the migrations on main", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const calls = stubFetch("[]");

    await listFilesOnMain();

    expect(calls[0]?.headers.Authorization).toBe("Bearer test-token");
  });

  it("fetches without a token when there is none", async () => {
    delete process.env.GITHUB_TOKEN;
    const calls = stubFetch("select 1;\n");

    await fetchFileOnMain("supabase/migrations/20261110035018_plan_refusal_sqlstate.sql");

    expect(calls[0]?.headers.Authorization).toBeUndefined();
  });
});
