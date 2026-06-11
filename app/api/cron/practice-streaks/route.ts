// Nightly cron — per-practice consistency ladder + Full Cycle payouts
// (Rewards Economy v2), then the cosmetic award sweeps (rank cosmetics at
// promotion, official-Journey badges + Full Spectrum). Called by Vercel Cron.

import { NextRequest, NextResponse } from 'next/server'
import { runPracticeStreaksJob } from '@/lib/practice-streaks-job'
import { sweepRankCosmetics, sweepJourneyBadges } from '@/lib/awards/cosmetics'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const streaks = await runPracticeStreaksJob()
  const ranks = await sweepRankCosmetics().catch(() => ({ granted: 0 }))
  const journeys = await sweepJourneyBadges().catch(() => ({ granted: 0 }))
  const result = { ...streaks, rankCosmetics: ranks.granted, journeyBadges: journeys.granted }
  log.info('cron.practice_streaks', result)

  return NextResponse.json({ ok: true, ...result })
}
