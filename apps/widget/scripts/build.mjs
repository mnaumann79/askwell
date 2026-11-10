#!/usr/bin/env node
/**
 * Builds the loader into the one file a customer's website loads
 * (docs/project.md §3, §6.5).
 *
 * The bundle lands in `apps/web/public/widget.js`, so the app serves the
 * loader and the panel from the same origin: the loader needs no environment
 * variable and the panel can talk back to it.
 */
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const widgetDir = path.join(scriptDir, "..");

/** Where the bundle goes. */
export const BUNDLE = path.join(widgetDir, "..", "web", "public", "widget.js");

/** The build, in one place: the package script and the test use the same. */
export const BUILD_OPTIONS = {
  entryPoints: [path.join(widgetDir, "src", "main.ts")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2019",
  outfile: BUNDLE,
  // The bundle is a browser file that lives in the app's `public/` folder, so
  // the app's lint sees it. This tells it which globals are browser ones.
  banner: { js: "/* global document, window */" },
};

/** Builds the loader. */
export async function buildWidget(outfile = BUNDLE) {
  await build({ ...BUILD_OPTIONS, outfile });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildWidget();
  console.log(`build: ${BUNDLE}`);
}
