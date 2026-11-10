/**
 * The projects we name, and what each may be used for.
 *
 * `supabase-projects.json` is the one place the repo says which Supabase projects
 * exist for us; `supabase-projects.md` beside it says what the entries mean. Both
 * scripts in this directory read that file and nothing else: a project that is not in
 * it is not a target.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.join(scriptDir, "..");

/** The file the projects are named in. */
export const CONFIG_FILE = path.join(packageDir, "supabase-projects.json");

/** The operation that applies a migration. */
export const MIGRATIONS_OPERATION = "migrations:agent";

/** The operation that reads a project's schema. */
export const TYPES_OPERATION = "types:agent";

/**
 * A refusal.
 *
 * There is no fallback anywhere in this file: every way the resolution can fail is a
 * refusal with a reason, so a caller can tell "the list is ambiguous" from "the file
 * is not the one you verified".
 *
 * @typedef {{ ok: false; reason: string; message: string }} Refusal
 * @typedef {{ ok: true; name: string; ref: string }} Target
 * @typedef {Refusal | Target} Resolution
 */

/**
 * @param {string} reason
 * @param {string} message
 * @returns {Refusal}
 */
export function refuse(reason, message) {
  return { ok: false, reason, message };
}

/** The projects we name, and what each may be used for. */
export async function readProjects(configFile = CONFIG_FILE) {
  const raw = await readFile(configFile, "utf8");
  return JSON.parse(raw);
}

/**
 * The entry that permits the operation.
 *
 * Exactly one entry permits it → that entry. None → a refusal that says which
 * operation has no permitted target. More than one → a refusal that says the list is
 * ambiguous. A silent fallback is the thing this list exists to prevent.
 *
 * `SUPABASE_PROJECT_ID` may narrow the list among the entries that already permit the
 * operation; it can never introduce one.
 *
 * @param {Record<string, { ref: string; allow: string[] }>} projects
 * @param {string} operation
 * @param {string | undefined} envProjectId
 * @returns {Resolution}
 */
export function resolveTarget(projects, operation, envProjectId) {
  const permitted = Object.entries(projects).filter(
    ([, entry]) => Array.isArray(entry.allow) && entry.allow.includes(operation),
  );

  if (envProjectId) {
    const narrowed = permitted.filter(([, entry]) => entry.ref === envProjectId);

    if (narrowed.length === 0) {
      return refuse(
        "project-not-permitted",
        `SUPABASE_PROJECT_ID names ${envProjectId}, which is not permitted for ${operation}. ` +
          `Permitted for ${operation}: ${permitted.map(([name]) => name).join(", ") || "none"}.`,
      );
    }

    if (narrowed.length > 1) {
      return refuse(
        "ambiguous-target",
        `SUPABASE_PROJECT_ID names ${envProjectId}, which ${narrowed.length} entries permit for ${operation}.`,
      );
    }

    return { ok: true, name: narrowed[0][0], ref: narrowed[0][1].ref };
  }

  if (permitted.length === 0) {
    return refuse(
      "no-permitted-target",
      `No project in supabase-projects.json permits ${operation}.`,
    );
  }

  if (permitted.length > 1) {
    return refuse(
      "ambiguous-target",
      `${permitted.length} projects permit ${operation}: ${permitted.map(([name]) => name).join(", ")}. ` +
        `Set SUPABASE_PROJECT_ID to choose one.`,
    );
  }

  return { ok: true, name: permitted[0][0], ref: permitted[0][1].ref };
}
