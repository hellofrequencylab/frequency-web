import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { computeReviewAggregate, type ReviewAggregate } from '@/lib/spaces/reviews-aggregate'
import { getRecordingById } from './recordings'
import { canViewRecording } from './types'

// Airwaves P2 — ratings on a Recording (ADR-608 §7d). A member leaves ONE 1-5 star review (plus an
// optional note) on a Recording; the summary reuses computeReviewAggregate (lib/spaces/reviews-aggregate)
// verbatim, exactly as the commerce/space review walls do. recording_reviews is service-role only (RLS
// deny-all, allowlisted), so every read/write rides the admin client behind an app-layer gate:
//   - RATE: only a viewer who canViewRecording may rate (a private Recording needs Space membership),
//   - MODERATE (hide/delete another member's review): the Recording's owning-Space owner or the author.
// Pure aggregate math lives in reviews-aggregate.ts (unit-tested there); this module is the IO + gate seam.

// eslint-disable-next-line no-restricted-syntax -- recording_reviews isn't in lib/database.types.ts yet (untyped seam, ADR-246)
const db = () => createAdminClient() as unknown as SupabaseClient

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/** One member's review as a surface renders it: the rating, the note, the author, and when it landed. */
export interface RecordingReview {
  id: string
  rating: number
  body: string
  createdAt: string
  author: { id: string; displayName: string; handle: string; avatarUrl: string | null } | null
}

/** The reviews wall a Recording surface renders: the aggregate (average + count + distribution), the
 *  visible reviews newest-first, and (when signed in) the caller's own review so the form pre-fills. */
export interface RecordingReviewSummary {
  aggregate: ReviewAggregate
  reviews: RecordingReview[]
  myReview: RecordingReview | null
}

type RawReviewRow = {
  id: string
  rating: number | null
  body: string | null
  status: string | null
  reviewer_profile_id: string
  created_at: string
  author: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
}

const REVIEW_SELECT =
  'id, rating, body, status, reviewer_profile_id, created_at, author:profiles!reviewer_profile_id ( id, display_name, handle, avatar_url )'

function mapReview(r: RawReviewRow): RecordingReview {
  return {
    id: r.id,
    rating: Number(r.rating ?? 0),
    body: r.body ?? '',
    createdAt: r.created_at,
    author: r.author
      ? { id: r.author.id, displayName: r.author.display_name, handle: r.author.handle, avatarUrl: r.author.avatar_url }
      : null,
  }
}

/**
 * The reviews summary for a Recording, for a given viewer. FAIL-SAFE: a missing table (pre-migration) or a
 * read error reads as an empty wall (never throws), so the surface renders the form before the migration
 * lands. Only VISIBLE reviews feed the aggregate + the public list; the caller's own review is returned
 * regardless of status so the form always reflects what they submitted.
 */
export async function getRecordingReviewSummary(
  recordingId: string,
  viewerProfileId: string | null | undefined,
): Promise<RecordingReviewSummary> {
  const empty: RecordingReviewSummary = {
    aggregate: computeReviewAggregate([]),
    reviews: [],
    myReview: null,
  }
  const rid = (recordingId ?? '').trim()
  if (!rid) return empty
  try {
    const { data, error } = await db()
      .from('recording_reviews')
      .select(REVIEW_SELECT)
      .eq('recording_id', rid)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return empty
    const rows = ((data ?? []) as unknown as RawReviewRow[]).map((r) => ({ raw: r, mapped: mapReview(r) }))
    const visible = rows.filter((r) => (r.raw.status ?? 'visible') === 'visible')
    const pid = (viewerProfileId ?? '').trim()
    const mine = pid ? rows.find((r) => r.raw.reviewer_profile_id === pid) ?? null : null
    return {
      aggregate: computeReviewAggregate(visible.map((r) => r.mapped.rating)),
      reviews: visible.map((r) => r.mapped),
      myReview: mine ? mine.mapped : null,
    }
  } catch {
    return empty
  }
}

/** Resolve whether a viewer may rate a Recording: signed in AND canViewRecording (a private Recording
 *  needs Space membership). Returns the owning space id + owner when allowed, for the moderation gate. */
async function resolveRateGate(
  recordingId: string,
  actorProfileId: string | null | undefined,
): Promise<
  | { ok: true; recordingId: string; spaceId: string; ownerProfileId: string | null }
  | { ok: false; error: string }
> {
  const pid = (actorProfileId ?? '').trim()
  if (!pid) return { ok: false, error: 'Sign in to rate this recording.' }
  const recording = await getRecordingById(recordingId)
  if (!recording) return { ok: false, error: 'That recording no longer exists.' }

  // Membership of the owning Space (the is_space_member analog) — mirrors the playback resolver.
  let isMember = false
  let ownerProfileId: string | null = null
  try {
    const { data } = await db()
      .from('spaces')
      .select('id, owner_profile_id, entitlements')
      .eq('id', recording.spaceId)
      .maybeSingle()
    const row = (data as { id: string; owner_profile_id: string | null; entitlements: unknown } | null) ?? null
    if (row) {
      ownerProfileId = row.owner_profile_id
      const caps = await getSpaceCapabilities(
        { id: row.id, ownerProfileId: row.owner_profile_id, entitlements: row.entitlements },
        pid,
      )
      isMember = caps.role !== null || caps.canEditProfile
    }
  } catch {
    isMember = false
  }

  if (!canViewRecording(recording, isMember)) {
    return { ok: false, error: 'Join this space to rate this recording.' }
  }
  return { ok: true, recordingId: recording.id, spaceId: recording.spaceId, ownerProfileId }
}

/** Insert or update the caller's review (one per member per Recording, upsert on the unique key). Gated:
 *  only a viewer who canViewRecording may rate. Returns the saved review. */
export async function submitRecordingReview(
  actorProfileId: string | null | undefined,
  recordingId: string,
  rating: number,
  body: string,
): Promise<Result<RecordingReview>> {
  const gate = await resolveRateGate(recordingId, actorProfileId)
  if (!gate.ok) return gate

  const star = Math.trunc(Number(rating))
  if (!(star >= 1 && star <= 5)) return { ok: false, error: 'Choose a rating from 1 to 5 stars.' }
  const note = (body ?? '').trim().slice(0, 2000)

  try {
    const { data, error } = await db()
      .from('recording_reviews')
      .upsert(
        {
          recording_id: gate.recordingId,
          reviewer_profile_id: (actorProfileId ?? '').trim(),
          rating: star,
          body: note,
          status: 'visible',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'recording_id,reviewer_profile_id' },
      )
      .select(REVIEW_SELECT)
      .maybeSingle()
    if (error || !data) return { ok: false, error: 'Could not save your rating. Try again.' }
    return { ok: true, value: mapReview(data as unknown as RawReviewRow) }
  } catch {
    return { ok: false, error: 'Could not save your rating. Try again.' }
  }
}

/** Remove a review. The author removes their own; the owning-Space owner moderates any on their Recording.
 *  Idempotent (a missing review is a no-op success). */
export async function deleteRecordingReview(
  actorProfileId: string | null | undefined,
  reviewId: string,
): Promise<Result<{ removed: boolean }>> {
  const pid = (actorProfileId ?? '').trim()
  if (!pid) return { ok: false, error: 'Sign in to manage reviews.' }
  const rid = (reviewId ?? '').trim()
  if (!rid) return { ok: false, error: 'Choose which review to remove.' }

  try {
    const { data } = await db()
      .from('recording_reviews')
      .select('id, recording_id, reviewer_profile_id')
      .eq('id', rid)
      .maybeSingle()
    const row = (data as { id: string; recording_id: string; reviewer_profile_id: string } | null) ?? null
    if (!row) return { ok: true, value: { removed: false } } // already gone

    let canRemove = row.reviewer_profile_id === pid
    if (!canRemove) {
      // The owning-Space owner may moderate a review on their Recording.
      const recording = await getRecordingById(row.recording_id)
      if (recording) {
        const { data: sp } = await db()
          .from('spaces')
          .select('owner_profile_id')
          .eq('id', recording.spaceId)
          .maybeSingle()
        const owner = (sp as { owner_profile_id: string | null } | null)?.owner_profile_id ?? null
        canRemove = owner != null && owner === pid
      }
    }
    if (!canRemove) return { ok: false, error: 'You do not have access to remove this review.' }

    const { error } = await db().from('recording_reviews').delete().eq('id', row.id)
    if (error) return { ok: false, error: 'Could not remove the review. Try again.' }
    return { ok: true, value: { removed: true } }
  } catch {
    return { ok: false, error: 'Could not remove the review. Try again.' }
  }
}
