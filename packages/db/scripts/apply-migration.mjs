#!/usr/bin/env node
/**
 * Applies a migration to a Supabase project (docs/project.md §7).
 *
 * The file is fetched from **merged main** over HTTP, so the bytes that are applied
 * are the bytes that were reviewed and merged — not whatever a local clone happens to
 * hold, and not a path the caller chose.
 *
 * The project is resolved from `supabase-projects.json`, the one place the repo names
 * the projects we may write to (see `supabase-projects.md`). `SUPABASE_PROJECT_ID` can
 * only narrow that list; it can never redirect a write.
 *
 * The row the platform records carries the file's own version, the name, and the file's
 * bytes in `statements` — so the applied content is checkable afterwards, and the check
 * is the same one this script runs itself.
 *
 * Usage:
 *   pnpm db:apply <version> [--expect-sha256 <hex>]
 *
 * <version> is the migration file's own UTC timestamp, e.g. `20261110035018`.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATIONS_OPERATION, readProjects, refuse, resolveTarget } from "./projects.mjs";

const execFileAsync = promisify(execFile);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.join(scriptDir, "..");
const repoRoot = path.join(packageDir, "..", "..");

/** The version is the migration file's own UTC timestamp: fourteen digits. */
const VERSION_PATTERN = /^\d{14}$/;

/** A migration file is `<timestamp>_<name>.sql` and nothing else. */
const MIGRATION_FILE_PATTERN = /^\d{14}_[A-Za-z0-9_-]+\.sql$/;

/** The directory the migrations live in, relative to the repository root. */
const MIGRATIONS_DIRECTORY = "supabase/migrations";

/**
 * The migration file for the version, among the files on merged main.
 *
 * The caller names a version, never a path: a path would let arbitrary SQL be
 * recorded as a migration.
 *
 * @param {string[]} files
 * @param {string} version
 * @returns {FileResolution}
 */
export function findMigrationFile(files, version) {
  if (!VERSION_PATTERN.test(version)) {
    return refuse(
      "invalid-version",
      `"${version}" is not a version. It is the migration file's own UTC timestamp, e.g. 20261110035018.`,
    );
  }

  const matches = files.filter(
    (file) => MIGRATION_FILE_PATTERN.test(file) && file.startsWith(`${version}_`),
  );

  if (matches.length === 0) {
    return refuse(
      "no-such-migration",
      `No migration with version ${version} is on merged main under ${MIGRATIONS_DIRECTORY}/.`,
    );
  }

  if (matches.length > 1) {
    return refuse(
      "ambiguous-migration",
      `${matches.length} files on merged main carry the version ${version}: ${matches.join(", ")}.`,
    );
  }

  return { ok: true, path: `${MIGRATIONS_DIRECTORY}/${matches[0]}`, name: matches[0] };
}

/**
 * What the apply did, or why it refused.
 *
 * @typedef {{ ok: false; reason: string; message: string }} Refusal
 * @typedef {{ ok: true; project: string; ref: string; version: string; name: string; md5: string; sha256: string; bytes: number }} Applied
 * @typedef {Refusal | Applied} Outcome
 * @typedef {{ ok: true; path: string; name: string }} MigrationFile
 * @typedef {Refusal | MigrationFile} FileResolution
 */

/**
 * The dollar-quote tag for the file's bytes.
 *
 * The tag must not appear in the SQL, or the quoting would end early. `$apply$`,
 * `$apply2$`, … until one does not appear.
 */
function dollarTag(sql) {
  let index = 0;
  let tag = "$apply$";

  while (sql.includes(tag)) {
    index += 1;
    tag = `$apply${index}$`;
  }

  return tag;
}

/**
 * The statement that records the row the platform records.
 *
 * The insert and the hash are one statement, so the hash that comes back is the hash
 * of the row the database stored — there is no window between the write and the check.
 */
export function buildInsertStatement({ version, name, sql }) {
  const tag = dollarTag(sql);

  return `with inserted as (
  insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('${version}', '${name}', array[${tag}${sql}${tag}])
  returning version, name, md5(statements[1]) as stmt_md5, octet_length(statements[1]) as stmt_bytes
) select * from inserted`;
}

/**
 * Applies a migration.
 *
 * The network and the database are parameters, so the same code runs against a real
 * project and against pglite in the tests.
 *
 * @param {{
 *   projects: Record<string, { ref: string; allow: string[] }>,
 *   operation?: string,
 *   version: string,
 *   expectSha256?: string,
 *   listFiles: () => Promise<string[]>,
 *   fetchFile: (filePath: string) => Promise<Buffer>,
 *   query: (ref: string, sql: string) => Promise<Record<string, unknown>[]>,
 * }} options
 * @returns {Promise<Outcome>}
 */
export async function applyMigration({
  projects,
  operation = MIGRATIONS_OPERATION,
  version,
  expectSha256,
  listFiles,
  fetchFile,
  query,
}) {
  const target = resolveTarget(projects, operation, process.env.SUPABASE_PROJECT_ID);

  if (!target.ok) {
    return target;
  }

  const files = await listFiles();
  const file = findMigrationFile(files, version);

  if (!file.ok) {
    return file;
  }

  const bytes = await fetchFile(file.path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const md5 = createHash("md5").update(bytes).digest("hex");

  if (expectSha256 && sha256 !== expectSha256) {
    return refuse(
      "wrong-hash",
      `The file on merged main is not the one you verified. sha256 ${sha256}, expected ${expectSha256}.`,
    );
  }

  // A duplicate trigger must not double-apply. The version is the file's identity:
  // two files may share a name and still be two migrations.
  const existing = await query(
    target.ref,
    `select count(*)::int as n from supabase_migrations.schema_migrations where version = '${version}'`,
  );
  const found = Number(existing[0]?.n ?? 0);

  if (found > 0) {
    return refuse(
      "row-exists",
      `The row for version ${version} is already on the project. Read it back and report it; ` +
        `a disagreement is corrected with an update, never a second insert.`,
    );
  }

  const statement = buildInsertStatement({
    version,
    name: file.name.slice(`${version}_`.length, -".sql".length),
    sql: bytes.toString("utf8"),
  });

  const inserted = await query(target.ref, statement);
  const row = inserted[0];

  if (!row || row.stmt_md5 !== md5 || Number(row.stmt_bytes) !== bytes.length) {
    return refuse(
      "hash-mismatch",
      `The stored row does not hold the bytes that were fetched. ` +
        `Read the row back and correct it with an update, never a second insert.`,
    );
  }

  return {
    ok: true,
    project: target.name,
    ref: target.ref,
    version,
    name: row.name,
    md5,
    sha256,
    bytes: bytes.length,
  };
}

/** The repository this script lives in, so "merged main" means its own main. */
async function repositorySlug() {
  const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: repoRoot });
  const url = stdout.trim().replace(/\.git$/, "");
  const match = url.match(/github\.com[/:]([^/]+)\/([^/]+)$/);

  if (!match) {
    throw new Error(`db:apply: cannot read the repository from the git remote: ${url}`);
  }

  return { owner: match[1], repo: match[2] };
}

/** The migration files on merged main. */
async function listFilesOnMain() {
  const { owner, repo } = await repositorySlug();
  const headers = { Accept: "application/vnd.github+json" };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${MIGRATIONS_DIRECTORY}?ref=main`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(
      `db:apply: cannot list ${MIGRATIONS_DIRECTORY}/ on main (HTTP ${response.status}).`,
    );
  }

  const entries = await response.json();

  return entries.map((entry) => entry.name);
}

/** The bytes of a file on merged main. */
async function fetchFileOnMain(filePath) {
  const { owner, repo } = await repositorySlug();
  const response = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/main/${filePath}`,
  );

  if (!response.ok) {
    throw new Error(`db:apply: cannot fetch ${filePath} from main (HTTP ${response.status}).`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/** Runs a statement against a project through the Management API. */
function queryProject() {
  return async (ref, sql) => {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });

    const body = await response.json();

    if (!response.ok) {
      throw new Error(
        `db:apply: the query failed (HTTP ${response.status}): ${JSON.stringify(body).slice(0, 400)}`,
      );
    }

    return body;
  };
}

/** The command line: the version, and the expectation about the file. */
export function parseArgs(argv) {
  const version = argv[0];
  let expectSha256;

  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === "--expect-sha256") {
      expectSha256 = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`db:apply: unknown argument "${argv[index]}".`);
    }
  }

  if (expectSha256 && !/^[0-9a-f]{64}$/i.test(expectSha256)) {
    throw new Error("db:apply: --expect-sha256 takes the file's sha256, 64 hex characters.");
  }

  return { version, expectSha256 };
}

/** Runs the command. */
async function main(argv) {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    console.error(
      "db:apply: SUPABASE_ACCESS_TOKEN is not set. It is the only thing this script needs.",
    );
    process.exit(1);
  }

  let parsed;

  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(String(error.message));
    process.exit(1);
  }

  if (!parsed.version) {
    console.error(
      "db:apply: the version is missing. It is the migration file's own UTC timestamp.",
    );
    process.exit(1);
  }

  const projects = await readProjects();

  const result = await applyMigration({
    projects,
    version: parsed.version,
    expectSha256: parsed.expectSha256,
    listFiles: listFilesOnMain,
    fetchFile: fetchFileOnMain,
    query: queryProject(),
  });

  if (!result.ok) {
    console.error(`db:apply: ${result.message}`);
    process.exit(1);
  }

  console.log(
    `db:apply: applied ${result.version}_${result.name}.sql to ${result.project} (${result.ref}).`,
  );
  console.log(`db:apply: ${result.bytes} bytes, md5 ${result.md5}, sha256 ${result.sha256}.`);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main(process.argv.slice(2));
}
