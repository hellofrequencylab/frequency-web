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
    // 30s, not vitest's 5s default. A whole class of guards here SCAN THE REPO — check:menu walks 117
    // files, check:tokens the whole app/ + components/ tree, gate-meter-drift greps for every gate's
    // enforcement call site (35s on its own). They were already sitting near the default, and adding
    // ~15 files tipped several over, so a green suite turned red with "check-menu is not green" and
    // "entry_points has no enforcement call site" — messages that point at the wrong thing entirely
    // and cost real time to chase. The assertions are unchanged; only the clock is. A genuine hang
    // still fails, just 25s later.
    testTimeout: 30_000,
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
