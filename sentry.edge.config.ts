// Edge-runtime Sentry init. Loaded by instrumentation.ts's register() when
// NEXT_RUNTIME === 'edge' (middleware/proxy, edge route handlers).
//
// SAFE NO-OP: maybeInitSentry() only calls Sentry.init() when a DSN is configured.
// See lib/observability/sentry.ts for the gating logic.

import { maybeInitSentry } from '@/lib/observability/sentry'

maybeInitSentry()
