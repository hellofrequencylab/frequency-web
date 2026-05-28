// Daily cron — rolls the recurring-event materialisation window forward.
// Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { generateAllOccurrences } from '@/lib/event-recurrence'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await generateAllOccurrences()
  console.log(
    `[event-occurrences] processed ${result.anchorCount} anchors, ` +
    `created ${result.occurrencesCreated} new occurrences`
  )

  return NextResponse.json({ ok: true, ...result })
}
