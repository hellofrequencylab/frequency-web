// Retention enforcement (ADR-069 Phase 5b). Purges data past its useful life: expired
// member tags (those with an `expires_at` in the past) and the raw interaction firehose
// past its window (PI.1 — high-volume, retention-bounded; the PI.2 rollups keep the
// durable aggregate). Extensible to computed traits with a finite `retentionDays`.
// Driven by a nightly cron. member_tags / interaction_events aren't in database.types
// yet (cast, repo convention).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { purgeExpiredStudioDrafts } from '@/lib/studio/draft-store'
import { sweepStaleImporterStaging } from '@/lib/importer/harvest/staging-lifecycle'
import { log } from '@/lib/log'

/** How long raw interaction_events rows are kept before purge (PI.1). The durable
 *  signal lives in the PI.2 rollups; the raw firehose is a short-window working set. */
export const INTERACTION_RETENTION_DAYS = 90

/**
 * How long a cron_run_markers claim row is kept (LIVE-174, ADR-1212 table from migration
 * 20270345000700). The table had no purge at all: weekly-digest claims one row per member per
 * ISO week and never deletes it on the happy path, so it grew by (active members x 52) a year
 * with nothing to bound it.
 *
 * WHY 60 AND NOT LESS. A marker is only ever CONSULTED for the key of the week being sent —
 * `weekly-digest:<profile_id>:<ISO week>` — so a row stops carrying meaning the moment its week
 * ends, and the correctness floor is one ISO week (7 days) plus one nightly run. Everything above
 * that floor is bought for operators, not for the algorithm: 60 days is ~8 weeks of "was this
 * member covered, and when?" still answerable in SQL after a digest complaint, which is the
 * question the table is the only record of. Deleting sooner would save nothing measurable
 * (a row is ~50 bytes) and would throw away the only per-member send evidence there is.
 *
 * WHY NOT MORE. The point of the row is the bound. At 100k members, 60 days holds ~860k rows,
 * flat forever; 365 days would hold ~5.2M for no extra answer.
 */
export const CRON_MARKER_RETENTION_DAYS = 60

/**
 * Every table the nightly job keeps bounded, named as the DATABASE names them. The cron route
 * reports one count per entry and types its log payload as `Record<RetentionTable, number>`, so
 * adding a table here without reporting it fails the build rather than going unmentioned.
 */
export const RETENTION_TABLES = [
  'member_tags',
  'interaction_events',
  'studio_draft',
  'cron_run_markers',
] as const
export type RetentionTable = (typeof RETENTION_TABLES)[number]

/** Pure: has an `expires_at` passed as of `now`? Null = never expires. Unit-tested. */
export function isExpired(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return false
  const t = Date.parse(expiresAt)
  return !Number.isNaN(t) && t < now
}

function db(): SupabaseClient {
  return createAdminClient()
}

/** Delete data past its window: expired member tags, raw interaction_events older than
 *  INTERACTION_RETENTION_DAYS, staged Spark drafts past their seven-day life
 *  (ADR-1001 in docs/DECISIONS.md), cron run markers past
 *  CRON_MARKER_RETENTION_DAYS, and the importer's staging media (a storage prefix, not a
 *  table: `site-media/importer/<intakeId>/`, LIVE-120 / ADR-1251) for intakes that were
 *  applied or abandoned. Returns how many of each were purged. */
export async function enforceRetention(
  now: Date = new Date(),
): Promise<{
  tagsPurged: number
  interactionsPurged: number
  studioDraftsPurged: number
  cronMarkersPurged: number
  importerStagingPurged: number
}> {
  const { data: tags } = await db()
    .from('member_tags')
    .delete()
    .lt('expires_at', now.toISOString())
    .not('expires_at', 'is', null)
    .select('profile_id')

  const cutoff = new Date(now.getTime() - INTERACTION_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const { data: interactions } = await db()
    .from('interaction_events')
    .delete()
    .lt('created_at', cutoff.toISOString())
    .select('id')

  // Unfinished Spark answers live seven days, matching the copy in the author's own browser. The
  // read path filters on the same window, so a missed night changes nothing an author can see;
  // this is what stops abandoned drafts accumulating.
  const studioDraftsPurged = await purgeExpiredStudioDrafts(now.getTime())

  const cronMarkersPurged = await purgeExpiredCronRunMarkers(now)

  // The importer's harvested media has no table row to expire, only a storage prefix per intake,
  // so it is aged out here beside the tables rather than in a cron of its own (the function
  // count is gated; a housekeeping sweep belongs in the housekeeping cron). BOUNDED per run by
  // the sweep's own caps; it logs and reports its own failures and never throws.
  const staging = await sweepStaleImporterStaging({ now })

  return {
    tagsPurged: (tags ?? []).length,
    interactionsPurged: (interactions ?? []).length,
    studioDraftsPurged,
    cronMarkersPurged,
    importerStagingPurged: staging.removed,
  }
}

/**
 * Delete cron_run_markers claim rows past CRON_MARKER_RETENTION_DAYS.
 *
 * The claim is a once-per-period lock, not a record with a life of its own: weekly-digest inserts
 * `weekly-digest:<profile_id>:<ISO week>` before it sends and only deletes it when the send throws
 * (app/api/cron/weekly-digest/route.ts). Nothing else ever removed a row, and no key is reusable
 * once its week has passed, so every successful send leaked one permanent row. This is the sweep.
 *
 * The delete is filtered on `created_at`, which migration 20270345001300 indexes for exactly this
 * statement. Not fail-silent: a failure is LOGGED (AGENTS.md — a swallowed error is an invisible
 * regression) rather than throwing, because the tags/interactions/drafts purges above have already
 * committed by this point and a transient failure here simply sweeps again tomorrow.
 */
async function purgeExpiredCronRunMarkers(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - CRON_MARKER_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const { data, error } = await db()
    .from('cron_run_markers')
    .delete()
    .lt('created_at', cutoff.toISOString())
    .select('key')

  if (error) {
    log.error('cron.enforce_retention.markers_purge_failed', {
      cutoff: cutoff.toISOString(),
      error: error.message,
    })
    return 0
  }
  return (data ?? []).length
}
