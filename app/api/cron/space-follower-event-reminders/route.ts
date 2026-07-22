// Space-follower event reminders cron — runs every 15 minutes via Vercel Cron.
//
// A SIBLING of /api/cron/event-reminders that reuses the same helpers (the tz-correct
// send window, the email outbox, suppression + preference gating) but targets a
// DIFFERENT, strictly OPT-IN audience: members who FOLLOW a Space and asked to hear
// about its upcoming PUBLIC events they have NOT RSVP'd to. The RSVP'd reminder cron
// is left completely untouched, so this can never regress the transactional path.
//
// All the safety gating (default-off opt-in, idempotent never-double-send, suppression,
// public-only) lives in lib/events/follower-reminders.ts. This route is just the
// authorized, heartbeat-wrapped entry point.

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { runSpaceFollowerEventReminders } from '@/lib/events/follower-reminders'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const result = await runSpaceFollowerEventReminders()

  log.info('cron.space_follower_event_reminders', {
    sent7d:    result['7d'].sent,
    events7d:  result['7d'].events,
    sent24h:   result['24h'].sent,
    events24h: result['24h'].events,
    sent2h:    result['2h'].sent,
    events2h:  result['2h'].events,
  })

  return NextResponse.json({ ok: true, ...result })
}

export const GET = withCronHeartbeat('space-follower-event-reminders', handler)
