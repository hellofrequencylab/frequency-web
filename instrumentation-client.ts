// Client-runtime Sentry init (browser bundle). Next 16 loads this automatically;
// it replaces the older sentry.client.config.ts convention.
//
// SAFE NO-OP: maybeInitSentry() only calls Sentry.init() when NEXT_PUBLIC_SENTRY_DSN
// is configured. Because the gate reads a NEXT_PUBLIC_ var, the browser bundle can
// see it; with no DSN, nothing initialises and no Sentry payload ships to clients.
// See lib/observability/sentry.ts for the gating logic.

import * as Sentry from '@sentry/nextjs'
import { maybeInitSentry } from '@/lib/observability/sentry'

maybeInitSentry()

// Instrument App Router client-side navigations for tracing. Exported even when
// Sentry is disabled — it resolves against the inert client and is a no-op then.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
