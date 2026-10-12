// LIVE-190 budget (ADR-1252): 2000 recipients per invocation, the cron_run_markers claim keeps one
// member from hearing twice in a week, and the recipient list is sorted so a cut-off run re-does
// only the head (one claim insert each) on a re-fire. The clock is CRON_TIME_BUDGET_MS from
// lib/cron/budget.ts; app/api/cron/budget.test.ts checks the declaration is applied.
//
// "This week in <region>" (LIVE-806, ADR-1720 workstream 9). Thursdays at 15:00 UTC (~8am PT),
// vercel.json `0 15 * * 4`: the day a person decides what their weekend holds.
//
// WHAT IT DOES. Reads every public, published, live Event scoped to a nexus_region whose true start
// falls in the next seven days, groups them by region, and mails each region's list to every member
// whose home region that is (`profiles.nexus_region_id = events.scope_region_id`, the id match
// lib/this-week.ts explains). A region with nothing coming up sends nothing: groupEventsByRegion
// only answers regions with at least one Event, and the recipient read is scoped to those ids, so
// an empty region never reaches the loop at all.
//
// THE GUARANTEES, each one the weekly digest's (scan2 L2-02, SCAN-611):
//   · every send passes the ONE send gate, ('email', 'lifecycle'): preference + lifecycle consent
//     + suppression in one decision (ADR-169). Lifecycle, not events: this is Frequency telling a
//     member what is on, not a reminder for an RSVP they made (the reason is beside the unsubscribe
//     category in lib/email.ts sendThisWeekEmail);
//   · every send is CLAIMED FIRST in cron_run_markers under `this-week:<profile_id>:<ISO week>`
//     (migration 20270345000700), a taken claim is a skip, and the outbox row carries the same key
//     as dedupeKey, so a re-fired or retried run cannot double-send;
//   · one member's throw is counted and logged with its stack, the claim is released so the next
//     run retries that member only, and `failed > 0` answers 500 so the heartbeat fail-pings.

import { NextRequest, NextResponse } from 'next/server'
import { sendThisWeekEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { groupEventsByRegion, thisWeekDedupeKey, type ThisWeekRegionBundle } from '@/lib/this-week'
import {
  listRecipientsInRegions,
  listRegions,
  listUpcomingPublicEventsByRegion,
  recipientEmail,
} from '@/lib/this-week-reads'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { createAdminClient } from '@/lib/supabase/admin'
import { briefError, errorStack, log } from '@/lib/log'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

/** Postgres unique_violation: the claim row already exists, i.e. this member was covered. */
const UNIQUE_VIOLATION = '23505'

type MarkerClient = {
  from: (table: 'cron_run_markers') => {
    insert: (row: { key: string }) => PromiseLike<{ error: { code?: string; message: string } | null }>
    delete: () => { eq: (col: 'key', value: string) => PromiseLike<{ error: { message: string } | null }> }
  }
}

/** cron_run_markers is not in the generated types yet (migration 20270345000700); reach it through a
 *  narrow untyped handle, the repo convention for not-yet-typed tables (ADR-246).
 *
 *  `.bind(client)` IS LOAD-BEARING (LIVE-053, ADR-1231): SupabaseClient.from reads `this.rest`, so a
 *  bare `client.from` handed back as a value throws `Cannot read properties of undefined (reading
 *  'rest')` on the first claim. The weekly digest shipped exactly that once. */
function markers(): MarkerClient['from'] {
  const client = createAdminClient() as unknown as MarkerClient
  return client.from.bind(client)
}

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const budget = cronBudget(2000)
  const now = new Date()

  // The regions that have something to say this week. Empty regions are absent here, so nothing
  // below can send for them.
  const [regions, eventRows] = await Promise.all([listRegions(), listUpcomingPublicEventsByRegion(now)])
  const bundles = groupEventsByRegion(regions, eventRows, { now, baseUrl: BASE_URL })
  const bundleByRegion = new Map<string, ThisWeekRegionBundle>(bundles.map((b) => [b.region.id, b]))

  const candidates = (await listRecipientsInRegions(bundles.map((b) => b.region.id)))
    .slice()
    .sort((a, b) => a.profileId.localeCompare(b.profileId))
  const { batch: recipients, remaining: tail } = budget.take(candidates)
  let remaining = tail
  let visited = 0
  let sent    = 0
  let skipped = 0
  let optOut  = 0
  let deduped = 0
  let failed  = 0

  await log.time('cron.this_week', async () => {
    for (const [i, recipient] of recipients.entries()) {
      if (budget.exhausted()) {
        remaining += recipients.length - i
        break
      }
      visited++
      // Per-member fail-safe: one member's throw is counted and logged, never the end of the run.
      try {
        const bundle = bundleByRegion.get(recipient.regionId)
        if (!bundle) {
          // Cannot happen (the recipient read is scoped to the bundled regions), but a skip is the
          // safe answer if it ever does: a member never gets an empty email.
          skipped++
          continue
        }

        const email = await recipientEmail(recipient.authUserId)
        if (!email) {
          skipped++
          continue
        }

        // The ONE seam (ADR-169).
        if (!(await resolveSendGate(recipient.profileId, 'email', 'lifecycle', { email })).allowed) {
          optOut++
          continue
        }

        // Claim this member's week BEFORE sending. A claim that already exists means an earlier
        // invocation covered them: skip, do not send twice.
        const key = thisWeekDedupeKey(recipient.profileId, now)
        const { error: claimError } = await markers()('cron_run_markers').insert({ key })
        if (claimError) {
          if (claimError.code === UNIQUE_VIOLATION) {
            deduped++
            continue
          }
          throw new Error(`claim failed: ${claimError.message}`)
        }

        try {
          await sendThisWeekEmail({
            to:                 email,
            recipientName:      recipient.displayName,
            recipientProfileId: recipient.profileId,
            regionName:         bundle.region.name,
            events:             bundle.events,
            dedupeKey:          key,
          })
        } catch (err) {
          // The send did not land: release the claim so the next run retries this member. A
          // release that fails is logged and the claim stands, which errs toward not double-sending.
          const { error: releaseError } = await markers()('cron_run_markers').delete().eq('key', key)
          if (releaseError) {
            log.error('cron.this_week.release_failed', { profile_id: recipient.profileId, key, error: releaseError.message })
          }
          throw err
        }
        sent++
      } catch (err) {
        failed++
        log.error('cron.this_week.member_failed', {
          profile_id: recipient.profileId,
          region_id: recipient.regionId,
          error: briefError(err),
          stack: errorStack(err),
        })
      }
    }
  })

  const counts = {
    regions: regions.length,
    regionsWithEvents: bundles.length,
    events: bundles.reduce((n, b) => n + b.events.length, 0),
    candidates: candidates.length,
    sent,
    skipped,
    optOut,
    deduped,
    failed,
    ...budget.summary(visited, remaining),
  }
  log.info('cron.this_week.counts', counts)

  // failed > 0 is a job failure the heartbeat must see (withCronHeartbeat fail-pings on a 5xx).
  // Everything that did send is already claimed, so the retry this provokes cannot double-send.
  return NextResponse.json({ ok: failed === 0, ...counts }, { status: failed === 0 ? 200 : 500 })
}

export const GET = withCronHeartbeat('this-week', handler)
