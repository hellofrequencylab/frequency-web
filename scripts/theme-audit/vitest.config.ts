import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Runs only the render matrix. The normal suite never includes it (its name is not *.test.tsx).
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../..', import.meta.url)),
      'server-only': fileURLToPath(new URL('../../test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['scripts/theme-audit/render.audit.tsx'], testTimeout: 300_000 },
})
