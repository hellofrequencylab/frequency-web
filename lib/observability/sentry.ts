// Shared Sentry wiring for the Next.js app (H0-4).
//
// SAFE NO-OP WHEN UNCONFIGURED. Sentry is enabled ONLY when a DSN env var is
// present: NEXT_PUBLIC_SENTRY_DSN (read on both server and client — the public
// prefix is required so the browser bundle can see it) with SENTRY_DSN as a
// server-only fallback. With no DSN, `Sentry.init()` is never called, so every
// `Sentry.*` capture call elsewhere becomes an inert no-op and the app behaves
// exactly as it did before this integration. Nothing here can crash the app.
//
// This module is the ONE place that decides "is Sentry on?" and builds the init
// options, so the three runtime configs (server, edge, client) stay identical in
// the parts that matter. Each runtime config calls maybeInit() at module load.
//
// ⚠️ THE STATIC IMPORT BELOW IS WHY THIS MODULE IS SERVER-EAGER / CLIENT-LAZY.
// Importing it pulls the whole SDK in with it. The server and edge configs want
// exactly that — Sentry's Node instrumentation has to be installed synchronously,
// before the modules it patches load — so sentry.server.config.ts and
// sentry.edge.config.ts import this file at module scope and that is correct.
// instrumentation-client.ts must NOT: on the browser side the same static import
// would put ~150 kB in the baseline chunk of every route. The client reaches this
// module through a gated `import()` of ./sentry-client.ts instead. Keep it that way
// — a new STATIC import of this module from anything on the client entry path
// silently undoes it, and no source-level gate would notice.

import * as Sentry from '@sentry/nextjs'

/** The DSN, or undefined when Sentry is not configured. NEXT_PUBLIC_ is read first
 *  so the same resolution works in the browser bundle; SENTRY_DSN is a server-side
 *  fallback for setups that only set the non-public var. */
export const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || undefined

/** True only when a DSN is present. Other observability code can gate on this to
 *  skip work entirely when monitoring is off. */
export const sentryEnabled = Boolean(SENTRY_DSN)

/** Release + environment tags shared by every runtime, derived from Vercel's
 *  injected env. All optional — absent values simply omit the tag. */
const release =
  process.env.NEXT_PUBLIC_SENTRY_RELEASE ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_PUBLIC_APP_VERSION ||
  undefined

const environment =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV ||
  'development'

/** Trace sample rate: 100% in dev, low in prod (override with SENTRY_TRACES_SAMPLE_RATE).
 *  Tracing only runs when Sentry is enabled at all, so this is moot when no DSN is set. */
function tracesSampleRate(): number {
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE
  if (raw) {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n
  }
  return process.env.NODE_ENV === 'development' ? 1.0 : 0.1
}

/** The init options shared across all runtimes. Runtime-specific configs spread
 *  this and may add their own integrations (e.g. client replay). */
export function baseSentryOptions(): Parameters<typeof Sentry.init>[0] {
  return {
    dsn: SENTRY_DSN,
    release,
    environment,
    tracesSampleRate: tracesSampleRate(),
    // Don't report the noise of normal navigation cancels / expected aborts.
    ignoreErrors: ['AbortError', 'NEXT_REDIRECT', 'NEXT_NOT_FOUND'],
  }
}

/**
 * Initialise Sentry for a runtime IF (and only if) a DSN is configured.
 * Returns true when init ran, false when Sentry stays disabled. Idempotent and
 * crash-proof: any failure to initialise is swallowed so observability can never
 * take down the request path it is meant to observe.
 */
export function maybeInitSentry(
  extra?: Parameters<typeof Sentry.init>[0],
): boolean {
  if (!sentryEnabled) return false
  try {
    Sentry.init({ ...baseSentryOptions(), ...extra })
    return true
  } catch {
    // Never let a monitoring misconfiguration break the app.
    return false
  }
}

/*  The client-navigation hook and `startClientSentry` used to live here. They moved to
 *  `./sentry-client.ts` because `Sentry.captureRouterTransitionStart` does NOT exist in
 *  @sentry/nextjs's edge build, and this module is imported by `sentry.edge.config.ts` — which
 *  failed the Vercel build outright while `tsc --noEmit` stayed clean. Keep this file free of
 *  client-exclusive SDK members: all three runtimes import it. */
