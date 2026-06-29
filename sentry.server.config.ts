// Server-runtime Sentry init (Node.js). Loaded by instrumentation.ts's register()
// when NEXT_RUNTIME === 'nodejs'. Captures errors from RSC, route handlers, server
// actions, and cron jobs.
//
// SAFE NO-OP: maybeInitSentry() only calls Sentry.init() when a DSN is configured.
// With no DSN this file imports, runs, and initialises nothing — zero behaviour
// change. See lib/observability/sentry.ts for the gating logic.

import { maybeInitSentry } from '@/lib/observability/sentry'

maybeInitSentry()
