import { defineConfig } from "vitest/config";

/**
 * Workspace level Vitest config: `pnpm vitest run` at the repo root runs the
 * tests of every package. Each package also has its own `test` script, which
 * is what `pnpm test` (`pnpm -r test`) calls.
 */
export default defineConfig({
  test: {
    projects: ["packages/shared", "packages/db", "apps/web", "apps/widget"],
  },
});
