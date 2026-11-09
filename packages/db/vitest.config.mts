import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["*.test.ts"],
    // Booting pglite with the pgvector extension takes a few seconds.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
