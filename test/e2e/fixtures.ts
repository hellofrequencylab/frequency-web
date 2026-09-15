// The one `test` every e2e spec imports (LIVE-328, ADR-1328).
//
// It is Playwright's own `test` with a single override: the browser context refuses router
// prefetches before any page opens on it. See `refuseRouterPrefetch` in surfaces.ts for what a
// prefetch costs the shared database and how one is told from a navigation. The override wraps
// the built-in `context` fixture rather than replacing it, so `test.use({ storageState })` in
// the shell describes still mints the signed-in context it always did.
//
// Not a `*.spec.ts`, so Playwright never collects it as a test file, and not a `*.test.ts`, so
// vitest never does either. The predicate and the handler it installs are unit-tested without a
// browser in router-prefetch.test.ts; this file only wires them.
import { test as base } from '@playwright/test'
import { refuseRouterPrefetch } from './surfaces'

export const test = base.extend({
  // `provide`, not Playwright's customary `use`: the React hooks lint rule reads a call named
  // `use(...)` as a hook, and a fixture is not a component.
  context: async ({ context }, provide) => {
    await refuseRouterPrefetch(context)
    await provide(context)
  },
})

export { expect } from '@playwright/test'
