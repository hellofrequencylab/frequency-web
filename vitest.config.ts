import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Lightweight harness for the pure core (authz, currency). The `@/` alias mirrors
// tsconfig so imports resolve. DB-touching code is tested with mocks separately.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // `**/node_modules/**` (not just top-level) and `.claude/**` keep nested
    // installs and agent worktrees (.claude/worktrees/*) out of the run.
    exclude: ['**/node_modules/**', '.next/**', '.claude/**'],
  },
})
