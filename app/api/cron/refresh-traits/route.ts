// Nightly cron — recomputes member_traits from the engagement ledger (ADR-069
// Phase 2). Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { refreshMemberTraits } from '@/lib/traits/refresh'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const result = await refreshMemberTraits()
  log.info('cron.refresh_traits', result)

  return NextResponse.json({ ok: true, ...result })
}
