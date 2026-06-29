// Next.js instrumentation entrypoint (App Router, Next 16). register() runs once
// per server/edge runtime at startup; onRequestError forwards server-side request
// errors (RSC, route handlers, middleware/proxy) to Sentry.
//
// SAFE NO-OP: the imported config modules only call Sentry.init() when a DSN is
// configured, and Sentry.captureRequestError resolves against the disabled client
// (doing nothing) when Sentry is off. With no DSN, instrumentation loads but
// captures nothing — no behaviour change.

import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Captures errors thrown in Server Components, route handlers, and the proxy.
export const onRequestError = Sentry.captureRequestError
