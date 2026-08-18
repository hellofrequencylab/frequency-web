// BROWSER-ONLY Sentry surface. Nothing on the server or edge path may import this file.
//
// 🔴 WHY THIS FILE EXISTS AT ALL — it is a build failure, not a tidiness preference.
// `Sentry.captureRouterTransitionStart` is exported by @sentry/nextjs's CLIENT build and NOT by its
// EDGE build. It first lived in `./sentry.ts`, which `sentry.edge.config.ts` and
// `sentry.server.config.ts` both import, so Turbopack resolved the namespace against
// `@sentry/nextjs/build/esm/edge/index.js`, found no such export, and failed the deploy outright:
//
//   Error: Export captureRouterTransitionStart doesn't exist in target module
//   Did you mean to import captureRequestError?
//
// ⚠️ AND `tsc --noEmit` WAS CLEAN THROUGHOUT. The package's TYPES present one unified surface across
// its runtime builds, so the checker had no reason to object; only bundling for the edge runtime
// resolves the real per-runtime entry point. That is this repo's own ADR-1003 lesson recurring one
// level down — every source-level gate was green and the artifact was broken — and it is why the
// fix is a module boundary rather than a cast or a `typeof` dodge: a boundary is a thing the
// bundler enforces, and a cast is a thing it cannot see.
//
// The shared gate (`SENTRY_DSN`, `sentryEnabled`, `baseSentryOptions`, `maybeInitSentry`) stays in
// `./sentry.ts`, because all three runtimes genuinely need it. Only the client-exclusive pieces live
// here, reached solely through the DSN-gated dynamic `import()` in `instrumentation-client.ts`.

import * as Sentry from '@sentry/nextjs'
import { maybeInitSentry } from './sentry'

/** The App Router client-navigation hook Next calls on every transition. Named here so
 *  `instrumentation-client.ts` can type its wrapper with a `type` import, which is erased at
 *  compile time and contributes no bytes to the baseline chunk. */
export type RouterTransitionHook = typeof Sentry.captureRouterTransitionStart

/**
 * Browser entry point, reached only through the DSN-gated `import()` in
 * `instrumentation-client.ts`. Initialises the client SDK and hands back the router transition
 * hook, so the SDK namespace never has to escape this module.
 *
 * Safe to call unconditionally: `maybeInitSentry()` re-checks the DSN, so if the gate ever loads
 * this module without one, nothing initialises and the returned hook resolves against the inert
 * client — a no-op, as before.
 */
export function startClientSentry(): RouterTransitionHook {
  maybeInitSentry()
  return Sentry.captureRouterTransitionStart
}
