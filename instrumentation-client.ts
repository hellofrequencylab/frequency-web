// Client-runtime Sentry init (browser bundle). Next 16 loads this automatically;
// it replaces the older sentry.client.config.ts convention.
//
// 🔴 NOTHING HERE MAY STATICALLY IMPORT SENTRY. This file is `require`d by Next's
// instrumentation-client loader straight from the main client entry (see
// next/dist/build/webpack/loaders/next-instrumentation-client-loader.js), so every
// static import it makes — directly or transitively — lands in the baseline chunk
// that ships on EVERY route. This module used to `import * as Sentry from
// '@sentry/nextjs'` and also import lib/observability/sentry (which imports the SDK
// itself), and its old comment defended that with "no Sentry payload ships to
// clients". That was true of NETWORK traffic and false of BYTES: ~150 kB of a 233 kB
// baseline chunk, on every route and every preview, whether or not a DSN was set.
//
// So the SDK is reached through a GATED dynamic import instead. `process.env.
// NEXT_PUBLIC_SENTRY_DSN` is the one form of the check the browser can resolve:
// Next inlines NEXT_PUBLIC_* vars at build time (next/dist/lib/static-env.js), so a
// configured deploy sees a string literal and loads the chunk, and a DSN-less deploy
// leaves the SDK in a split chunk nothing ever fetches. The server-only SENTRY_DSN
// fallback is deliberately NOT consulted here — it is never inlined into the browser
// bundle, so it could only ever read `undefined` on this side.
//
// See lib/observability/sentry.ts for the shared gating + init options.

import type { RouterTransitionHook } from '@/lib/observability/sentry'

/** Set once the Sentry chunk has loaded; stays undefined when Sentry is disabled. */
let routerTransitionHook: RouterTransitionHook | undefined

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import('@/lib/observability/sentry')
    .then((sentry) => {
      routerTransitionHook = sentry.startClientSentry()
    })
    // Monitoring must never take down the app it monitors: a chunk that fails to
    // load leaves the hook below a no-op, exactly as if Sentry were switched off.
    .catch(() => {})
}

// Instrument App Router client-side navigations for tracing.
//
// ⚠️ THIS EXPORT MUST EXIST AND STAY CALLABLE EVEN WITH SENTRY OFF. Next reads it off
// this module's namespace and invokes it on every client navigation
// (next/dist/client/components/router-transition.js). It is a stable wrapper rather
// than a re-export because the real handler now arrives asynchronously: before the
// chunk resolves — and forever, when no DSN is configured — this is a no-op. The
// only cost is that a navigation started in the first few ms of a configured
// session may not be traced; nothing about the navigation itself changes.
export const onRouterTransitionStart: RouterTransitionHook = (...args) => {
  routerTransitionHook?.(...args)
}
