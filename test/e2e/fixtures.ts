// The one `test` every e2e spec imports (LIVE-328, ADR-1328; LIVE-333, ADR-NNNN).
//
// It is Playwright's own `test` with two overrides, both of them about what the capture costs and
// what it is allowed to photograph:
//
//   1. The browser context REFUSES ROUTER PREFETCHES before any page opens on it. See
//      `refuseRouterPrefetch` in surfaces.ts for what a prefetch costs the shared database and
//      how one is told from a navigation.
//   2. The context RECORDS EVERY 5xx the page under test (or any of its RSC fetches, images,
//      fonts, scripts or stylesheets) receives, into a per-test `serverErrors` log. The visual
//      and a11y suites read that log through `assertNoServerErrors` immediately before the
//      shutter / before axe, and REFUSE the surface rather than photographing a degraded
//      deployment. See the long note above `TELEMETRY_5XX_IGNORED` in surfaces.ts: a capture
//      taken inside the 2026-09-14 503 window was committed as the baseline, and the 62 public
//      comparisons that then failed at 1 to 2 percent were measured against the window.
//
// Both wrap the built-in `context` fixture rather than replacing it, so `test.use({ storageState })`
// in the shell describes still mints the signed-in context it always did.
//
// `serverErrors` is declared as its own test-scoped fixture, and `context` DEPENDS on it, so the
// log a spec receives is the same object the recorder is filling: Playwright resolves a fixture
// once per test, and the dependency edge is what guarantees the recorder is installed before the
// page exists rather than after the first navigation.
//
// Not a `*.spec.ts`, so Playwright never collects it as a test file, and not a `*.test.ts`, so
// vitest never does either. The predicates and handlers these install are unit-tested without a
// browser in router-prefetch.test.ts and server-errors.test.ts; this file only wires them.
import { test as base } from '@playwright/test'
import {
  createServerErrorLog,
  refuseRouterPrefetch,
  watchServerErrors,
  type ServerErrorLog,
} from './surfaces'

export const test = base.extend<{ serverErrors: ServerErrorLog }>({
  // `provide`, not Playwright's customary `use`: the React hooks lint rule reads a call named
  // `use(...)` as a hook, and a fixture is not a component.
  serverErrors: async ({}, provide) => {
    await provide(createServerErrorLog())
  },
  context: async ({ context, serverErrors }, provide) => {
    await refuseRouterPrefetch(context)
    watchServerErrors(context, serverErrors)
    await provide(context)
  },
})

export { expect } from '@playwright/test'
