import { defineConfig } from "vitest/config";

export default defineConfig({
  // The app's tsconfig keeps `jsx: preserve` for Next.js. Tests are compiled
  // by oxc, which needs the automatic JSX runtime instead.
  oxc: { jsx: "react-jsx" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.tsx", "tests/**/*.test.ts"],
  },
});
