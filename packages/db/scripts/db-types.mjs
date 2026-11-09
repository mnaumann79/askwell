#!/usr/bin/env node
/**
 * Regenerates `packages/db/types.ts` from the Supabase dev project
 * (docs/project.md §3).
 *
 * The Supabase CLI prints the types to stdout. The file is only written when
 * the CLI succeeds, so a failed run never leaves an empty `types.ts` behind.
 *
 * Needs the Supabase CLI and a SUPABASE_ACCESS_TOKEN with the `database_read`
 * scope, plus SUPABASE_PROJECT_ID (the project ref of the dev project).
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectId = process.env.SUPABASE_PROJECT_ID;

if (!projectId) {
  console.error(
    "db:types: SUPABASE_PROJECT_ID is not set. It is the project ref of the Supabase dev project.",
  );
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const typesFile = path.join(scriptDir, "..", "types.ts");

const cli = spawn("supabase", ["gen", "types", "--schema", "public", `--remote=${projectId}`], {
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
    console.log(`db:types: wrote ${typesFile}.`);
  });
});
