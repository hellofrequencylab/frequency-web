// Nightly cron — purges expired member data (ADR-069 Phase 5b). Called by Vercel
// Cron (see vercel.json). Requires CRON_SECRET.
// Also ages out the importer's staging media under site-media/importer/<intakeId>/ (LIVE-120):
// a bounded batch per run, so the sweep is a policy and not a one-off backfill.

import { NextRequest, NextResponse } from 'next/server'
import { enforceRetention, type RetentionTable } from '@/lib/consent/retention'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

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
  // `importerStagingPurged` rides beside the table counts, not inside them: it is a storage
  // prefix (site-media/importer/<intakeId>/, LIVE-120 / ADR-1251), swept by the same night.
  log.info('cron.enforce_retention', { ...result, purgedByTable })

  return NextResponse.json({ ok: true, ...result, purgedByTable })
}

export const GET = withCronHeartbeat('enforce-retention', handler)
