import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The loader is DOM work: it needs a real document to be tested in.
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
