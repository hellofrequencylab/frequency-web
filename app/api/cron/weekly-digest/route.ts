// Weekly community digest cron — runs Sundays at 14:00 UTC (~7am PT,
// matches when most members are actually awake on their day off).
//
// For each active profile (anyone with a circle membership), assemble a
// per-person digest. Skip people with nothing to surface (no recent
// dispatches AND no upcoming events) so we never send hollow emails.
// Each send gated by the unified send-gate for ('email', 'lifecycle') — preference + lifecycle
// consent + suppression in one decision (ADR-169), not the bare preference read it used to be.
//
// 2026-09-05 (scan2 L2-02): the run is now idempotent per member per ISO week and fail-safe per
// member. Before, a second invocation in the same week (a dashboard re-fire, a redeploy re-run, or
// the retry of a run whose enqueue threw midway) re-sent the digest to everyone already covered,
// and one member's throw aborted the loop for everyone after them. Now each member's send is
// claimed in cron_run_markers under `weekly-digest:<profile_id>:<ISO week>` (migration
// 20270345000700) before it goes out, a taken claim is a skip, a throw is counted and released so
// the next run retries that one member, and `failed > 0` answers 500 so the heartbeat fail-pings.
// The claim lives in a marker table rather than on the outbox row because sendWeeklyDigestEmail
// (lib/email.ts) builds the outbox payload itself and has no seam for enqueue()'s dedupeKey yet.

import { NextRequest, NextResponse } from 'next/server'
import { sendWeeklyDigestEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { assembleDigestForProfile, listProfileIdsForDigest } from '@/lib/digest'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { createAdminClient } from '@/lib/supabase/admin'
import { briefError, log } from '@/lib/log'

export const dynamic = 'force-dynamic'

/** Postgres unique_violation: the claim row already exists, i.e. this member was covered. */
const UNIQUE_VIOLATION = '23505'

/** ISO-8601 week label (`2026-W36`) for the Monday-based week containing `at`. Pure, UTC. */
function isoWeekOf(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
  // Shift to the Thursday of this week: ISO weeks belong to the year that holds their Thursday.
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** The idempotency key for one member's digest in one ISO week. */
function digestDedupeKey(profileId: string, at: Date): string {
  return `weekly-digest:${profileId}:${isoWeekOf(at)}`
}

type MarkerClient = {
  from: (table: 'cron_run_markers') => {
    insert: (row: { key: string }) => PromiseLike<{ error: { code?: string; message: string } | null }>
    delete: () => { eq: (col: 'key', value: string) => PromiseLike<{ error: { message: string } | null }> }
  }
}

/** cron_run_markers is not in the generated types yet (migration 20270345000700); reach it through a
 *  narrow untyped handle, the repo convention for not-yet-typed tables (ADR-246). */
function markers(): MarkerClient['from'] {
  return (createAdminClient() as unknown as MarkerClient).from
}

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const profileIds = await listProfileIdsForDigest()
  const now = new Date()
  let sent    = 0
  let skipped = 0
  let optOut  = 0
  let deduped = 0
  let failed  = 0

  // Timed: assembling + sending every per-person digest is the cron's whole cost
  // and scales with member count, so wrap it in log.time to emit one structured
  // line carrying duration_ms + ok, queryable/alertable by `cron.weekly_digest`.
  await log.time('cron.weekly_digest', async () => {
    for (const profileId of profileIds) {
      // Per-member fail-safe: one member's throw is counted and logged, never the end of the run.
      try {
        const payload = await assembleDigestForProfile(profileId)
        if (!payload) {
          skipped++
          continue
        }

        // The ONE seam (ADR-169). The bare preference read it replaced skipped suppression and the
        // lifecycle consent scope (meta-scan B9 H6), so a bounced or revoked address still got the
        // digest. Strictly safer: email_lifecycle consent defaults to granted (lib/consent/scopes.ts).
        if (!(await resolveSendGate(profileId, 'email', 'lifecycle', { email: payload.email })).allowed) {
          optOut++
          continue
        }

        // Claim this member's week BEFORE sending. A claim that already exists means an earlier
        // invocation covered them: skip, do not send twice.
        const key = digestDedupeKey(profileId, now)
        const { error: claimError } = await markers()('cron_run_markers').insert({ key })
        if (claimError) {
          if (claimError.code === UNIQUE_VIOLATION) {
            deduped++
            continue
          }
          throw new Error(`claim failed: ${claimError.message}`)
        }

        try {
          await sendWeeklyDigestEmail({
            to:                 payload.email,
            recipientName:      payload.displayName,
            recipientProfileId: payload.profileId,
            dispatches:         payload.dispatches,
            upcomingEvents:     payload.upcomingEvents,
            topStreak:          payload.topStreak,
            rank:               payload.rank,
            goAgain:            payload.goAgain,
          })
        } catch (err) {
          // The send did not land: release the claim so the next run retries this member. A
          // release that fails is logged and the claim stands, which errs toward not double-sending.
          const { error: releaseError } = await markers()('cron_run_markers').delete().eq('key', key)
          if (releaseError) {
            log.error('cron.weekly_digest.release_failed', { profile_id: profileId, key, error: releaseError.message })
          }
          throw err
        }
        sent++
      } catch (err) {
        failed++
        log.error('cron.weekly_digest.member_failed', { profile_id: profileId, error: briefError(err) })
      }
    }
  })

  const counts = {
    candidates: profileIds.length,
    sent,
    skipped,
    optOut,
    deduped,
    failed,
  }
  log.info('cron.weekly_digest.counts', counts)

  // failed > 0 is a job failure the heartbeat must see (withCronHeartbeat fail-pings on a 5xx).
  // Everything that did send is already claimed, so the retry this provokes cannot double-send.
  return NextResponse.json({ ok: failed === 0, ...counts }, { status: failed === 0 ? 200 : 500 })
}

export const GET = withCronHeartbeat('weekly-digest', handler)
