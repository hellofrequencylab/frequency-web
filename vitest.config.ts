import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Lightweight harness for the pure core (authz, currency). The `@/` alias mirrors
// tsconfig so imports resolve. DB-touching code is tested with mocks separately.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // `server-only` is a Next.js build-time guard with no runtime package, so it
      // can't resolve under vitest. Stub it to an empty module so server-only files
      // (e.g. lib/walkthroughs/runtime.ts) can still be unit-tested for their pure parts.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // `.tsx` is included so component-level tests (e.g. the Puck render-parity
    // gate in lib/page-editor/block-render.test.tsx) can use JSX directly.
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // `**/node_modules/**` (not just top-level) and `.claude/**` keep nested
    // installs and agent worktrees (.claude/worktrees/*) out of the run.
    // `resonance/**` is the standalone embeddable project: it has its own vitest
    // (and `@/` alias) and must never be collected by Frequency's run.
    exclude: ['**/node_modules/**', '.next/**', '.claude/**', 'resonance/**'],
  },
})
