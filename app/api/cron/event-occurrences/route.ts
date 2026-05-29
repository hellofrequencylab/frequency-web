// Daily cron — rolls the recurring-event materialisation window forward.
// Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { generateAllOccurrences } from '@/lib/event-recurrence'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const result = await generateAllOccurrences()
  console.log(
    `[event-occurrences] processed ${result.anchorCount} anchors, ` +
    `created ${result.occurrencesCreated} new occurrences`
  )

  return NextResponse.json({ ok: true, ...result })
}
