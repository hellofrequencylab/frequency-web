// LIVE-190 budget (ADR-1252): BOUNDED BY DESIGN. Four bulk statements per invocation (two DELETEs
// and two purges), no per-row round trip, so the work is bounded by the database's statement
// timeout rather than by a batch this route could take. The stated 4 is the statement count.
// app/api/cron/budget.test.ts names this route in BOUNDED_BY_DESIGN with that reason.
// Nightly cron — purges expired member data (ADR-069 Phase 5b). Called by Vercel
// Cron (see vercel.json). Requires CRON_SECRET.
// Also ages out the importer's staging media under site-media/importer/<intakeId>/ (LIVE-120):
// a bounded batch per run, so the sweep is a policy and not a one-off backfill.

import { NextRequest, NextResponse } from 'next/server'
import { enforceRetention, type RetentionTable } from '@/lib/consent/retention'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const budget = cronBudget(4)
  const result = await enforceRetention()
  // One count per TABLE this job bounds, beside the camelCase counts the response has always
  // carried. The question this cron exists to answer is "which tables are kept from growing
  // without bound, and did last night's sweep touch them?", and until LIVE-174 the answer lived
  // only in lib/consent/retention.ts — cron_run_markers grew unswept for exactly that long.
  // Typed as Record<RetentionTable, number>, so a table added to RETENTION_TABLES fails the
  // build here until this line names it too.
  const purgedByTable: Record<RetentionTable, number> = {
    member_tags: result.tagsPurged,
    interaction_events: result.interactionsPurged,
    studio_draft: result.studioDraftsPurged,
    cron_run_markers: result.cronMarkersPurged,
  }
  const summary = budget.summary(
    result.tagsPurged + result.interactionsPurged + result.studioDraftsPurged + result.cronMarkersPurged,
    0,
  )
  log.info('cron.enforce_retention', { ...result, purgedByTable, ...summary })
  return NextResponse.json({ ok: true, ...result, purgedByTable, budget: summary })
}

export const GET = withCronHeartbeat('enforce-retention', handler)
