import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest configuration for Node + TypeScript path aliases.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
