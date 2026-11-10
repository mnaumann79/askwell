#!/usr/bin/env node
/**
 * Regenerates `packages/db/types.ts` from the Supabase dev project
 * (docs/project.md §3).
 *
 * The Supabase CLI prints the types to stdout. The file is only written when
 * the CLI succeeds, so a failed run never leaves an empty `types.ts` behind.
 *
 * **The target comes from `supabase-projects.json`**, the one place the repo names
 * the projects we may read (see `supabase-projects.md`). The ref is not read from
 * the environment: this script acts only on a project whose `allow` contains
 * `types:agent`, and a `SUPABASE_PROJECT_ID` that names anything else is refused
 * rather than obeyed. The consequence of getting it wrong here is a wrong types
 * file rather than a write, which is why the same guard as the apply script
 * applies here.
 *
 * Needs the Supabase CLI and a SUPABASE_ACCESS_TOKEN with the `database_read`
 * scope. `SUPABASE_PROJECT_ID` is optional: it only narrows the choice among the
 * projects that already permit the operation.
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TYPES_OPERATION, readProjects, resolveTarget } from "./projects.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const typesFile = path.join(scriptDir, "..", "types.ts");

const projects = await readProjects();
const target = resolveTarget(projects, TYPES_OPERATION, process.env.SUPABASE_PROJECT_ID);

if (!target.ok) {
  console.error(`db:types: ${target.message}`);
  process.exit(1);
}

const cli = spawn("supabase", ["gen", "types", "--schema", "public", `--remote=${target.ref}`], {
  stdio: ["ignore", "pipe", "inherit"],
});

let stdout = "";
cli.stdout.setEncoding("utf8");
cli.stdout.on("data", (chunk) => {
  stdout += chunk;
});

cli.on("error", (error) => {
  console.error(`db:types: could not run the Supabase CLI: ${error.message}`);
  process.exit(1);
});

cli.on("close", (code) => {
  if (code !== 0) {
    console.error(`db:types: the Supabase CLI exited with code ${code}.`);
    process.exit(code ?? 1);
  }

  if (!stdout.trim()) {
    console.error("db:types: the Supabase CLI returned no types.");
    process.exit(1);
  }

  void writeFile(typesFile, stdout, "utf8").then(() => {
    console.log(`db:types: wrote ${typesFile} from ${target.name} (${target.ref}).`);
  });
});
