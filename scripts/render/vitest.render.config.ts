import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// FIXTURE RENDER config: runs only scripts/render/*.render.tsx (never part of `pnpm test`).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../..', import.meta.url)),
      'server-only': fileURLToPath(new URL('../../test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['scripts/render/*.render.tsx'], testTimeout: 60_000 },
})
