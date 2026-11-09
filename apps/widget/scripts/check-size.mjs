#!/usr/bin/env node
/**
 * Fails the build when the widget bundle grows over the 5 kb limit
 * (docs/project.md §3).
 *
 * The limit can be overridden with WIDGET_MAX_BYTES, which is only used to test
 * that this check actually fails.
 */
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 5 * 1024;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const bundle = path.join(scriptDir, "..", "dist", "widget.js");

const limit = Number.parseInt(process.env.WIDGET_MAX_BYTES ?? "", 10) || MAX_BYTES;

let size;
try {
  size = (await stat(bundle)).size;
} catch {
  console.error(`check:size: ${bundle} is missing. Build the widget first.`);
  process.exit(1);
}

if (size > limit) {
  console.error(`check:size: widget.js is ${size} bytes, over the ${limit} byte limit.`);
  process.exit(1);
}

console.log(`check:size: widget.js is ${size} bytes (limit ${limit}).`);
