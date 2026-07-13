import { getRecordingReviewSummary } from '@/lib/airwaves/reviews'
import { getListingComments } from '@/lib/marketplace/listing-comments'
import { canViewRecording } from '@/lib/airwaves/types'
import type { Recording } from '@/lib/airwaves/types'
import { RecordingReviews } from './recording-reviews'
import { ListingQna } from '@/components/marketplace/listing-qna'

// Airwaves P2 — the engagement surface under a Recording (ADR-608 §7d). A SERVER component that composes
// ratings + discussion by REUSING the existing spines:
//   - Ratings: lib/airwaves/reviews (recording_reviews + computeReviewAggregate), rendered by RecordingReviews.
//   - Discussion: the polymorphic listing_comments spine (target_kind='recording'), read by getListingComments
//     and rendered by the shared ListingQna component (no fork).
// It only renders when the viewer may SEE the Recording (canViewRecording); a walled private Recording shows
// nothing. Rating is gated further to signed-in viewers (canRate); moderation to the owning-Space owner.

export async function RecordingEngagement({
  recording,
  viewerProfileId,
  isMember,
  canEdit,
  isStaff,
  revalidatePath,
}: {
  recording: Recording
  viewerProfileId: string | null
  /** The viewer actively belongs to the owning Space (the is_space_member analog). */
  isMember: boolean
  /** The viewer can edit the owning Space (owner / admin / editor) — the owner-voice + moderation gate. */
  canEdit: boolean
  /** The viewer is platform staff previewing the Space. */
  isStaff: boolean
  /** The route to revalidate after a discussion post/delete (the comment spine relies on it). */
  revalidatePath: string
}) {
  const canView = canViewRecording(recording, isMember || canEdit)
  if (!canView) return null

  const [summary, comments] = await Promise.all([
    getRecordingReviewSummary(recording.id, viewerProfileId),
    getListingComments('recording', recording.id),
  ])

  const signedIn = !!viewerProfileId
  const canModerate = canEdit || isStaff

  return (
    <div className="border-t border-border pt-4">
      <RecordingReviews
        recordingId={recording.id}
        aggregate={summary.aggregate}
        reviews={summary.reviews}
        myReview={summary.myReview}
        canRate={signedIn}
        canModerate={canModerate}
        myProfileId={viewerProfileId}
      />
      <ListingQna
        targetKind="recording"
        targetId={recording.id}
        revalidatePath={revalidatePath}
        comments={comments}
        canPost={signedIn}
        canModerate={canModerate}
        myProfileId={viewerProfileId}
        isOwner={canEdit}
      />
    </div>
  )
}
