// Shared authorization gate for Vercel Cron endpoints.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. We verify it here.
//
// Fail-CLOSED by design: a missing CRON_SECRET in production rejects every
// request rather than waving it through. (The previous per-route check was
// `if (CRON_SECRET && ...)`, which silently disabled auth whenever the env
// var was unset — leaving the endpoints world-callable in that state.)
//
// Only a local `next dev` run (and the test runner) may leave the secret unset; the moment a secret
// IS set, it is enforced everywhere. SCAN-1124: the allowance used to be "anything but production",
// which waved through a staging or self-hosted deploy that runs with another NODE_ENV.

import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

/** Constant-time string compare (mirrors lib/webhook-verify.ts). A plain `!==` on the
 *  bearer leaks how far it matched via timing; this does not. Different lengths short-
 *  circuit (length is not the secret), equal lengths compare in constant time. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Returns a 401 response if the request is not an authorized cron call,
 * or null if it may proceed. Usage:
 *
 *   const denied = rejectUnauthorizedCron(req)
 *   if (denied) return denied
 */
export function rejectUnauthorizedCron(req: Request): NextResponse | null {
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      return null // dev convenience: unauthenticated local runs allowed
    }
    console.error('[cron-auth] CRON_SECRET is not set — rejecting request.')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 401 })
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader || !safeEqual(authHeader, `Bearer ${CRON_SECRET}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
