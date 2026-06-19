import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Self-contained test config. `@/` resolves to the project root, matching tsconfig.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
