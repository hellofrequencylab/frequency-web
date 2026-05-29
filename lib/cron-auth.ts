// Shared authorization gate for Vercel Cron endpoints.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. We verify it here.
//
// Fail-CLOSED by design: a missing CRON_SECRET in production rejects every
// request rather than waving it through. (The previous per-route check was
// `if (CRON_SECRET && ...)`, which silently disabled auth whenever the env
// var was unset — leaving the endpoints world-callable in that state.)
//
// In development we allow an unset secret so local cron runs work without
// configuration; the moment a secret IS set, it is enforced everywhere.

import { NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * Returns a 401 response if the request is not an authorized cron call,
 * or null if it may proceed. Usage:
 *
 *   const denied = rejectUnauthorizedCron(req)
 *   if (denied) return denied
 */
export function rejectUnauthorizedCron(req: Request): NextResponse | null {
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[cron-auth] CRON_SECRET is not set in production — rejecting request.')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 401 })
    }
    return null // dev convenience: unauthenticated local runs allowed
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
