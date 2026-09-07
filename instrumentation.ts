// Next.js instrumentation entrypoint (App Router, Next 16). register() runs once
// per server/edge runtime at startup; onRequestError forwards server-side request
// errors (RSC, route handlers, middleware/proxy) to Sentry.
//
// SAFE NO-OP: the imported config modules only call Sentry.init() when a DSN is
// configured, and Sentry.captureRequestError resolves against the disabled client
// (doing nothing) when Sentry is off. With no DSN, instrumentation loads but
// captures nothing — no behaviour change.

import type { Instrumentation } from 'next'
import * as Sentry from '@sentry/nextjs'
import { isClientAbortedStream } from '@/lib/observability/request-error'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Captures errors thrown in Server Components, route handlers, and the proxy.
//
// ONE classification sits in front of the recorder (LIVE-210, ADR-1236): React's "The destination
// stream closed early." is the client closing the connection mid-payload (a cancelled prefetch, a
// navigation away), not a failure of the route, so it is not recorded. The match is exact and lives
// in lib/observability/request-error.ts with the digest and the production sample that justify it.
// Everything else goes to Sentry unchanged. Do not add a second case here without the same shape:
// an exact match, a named digest, and a test.
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  if (isClientAbortedStream(err)) return
  return Sentry.captureRequestError(err, request, context)
}
