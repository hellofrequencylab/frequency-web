'use server'

// Airwaves P2 — the Recording ratings actions (ADR-608 §7d). Thin 'use server' wrappers the client
// engagement island calls: rate (upsert the caller's 1-5 review) and remove (author or owning-Space
// owner). lib/auth is safe in a 'use server' module; the actor id flows into the gated lib/airwaves/reviews
// seam, which re-applies the canViewRecording gate (rate) and the author/owner gate (remove). The client
// only reflects the result.

import { getMyProfileId } from '@/lib/auth'
import { submitRecordingReview, deleteRecordingReview, type RecordingReview } from '@/lib/airwaves/reviews'

type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** Rate a Recording 1-5 with an optional note. Gated on canViewRecording inside submitRecordingReview. */
export async function submitRecordingReviewAction(
  recordingId: string,
  rating: number,
  body: string,
): Promise<ActionResult<RecordingReview>> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, error: 'Sign in to rate this recording.' }
  return submitRecordingReview(profileId, recordingId, rating, body)
}

/** Remove a review (the author, or the Recording's owning-Space owner). */
export async function deleteRecordingReviewAction(
  reviewId: string,
): Promise<ActionResult<{ removed: boolean }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, error: 'Sign in to manage reviews.' }
  return deleteRecordingReview(profileId, reviewId)
}
