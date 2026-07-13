'use client'

// Airwaves P2 — the Recording ratings wall (ADR-608 §7d). A summary (average + count + per-star bars from
// computeReviewAggregate), a 1-5 star form for a signed-in viewer who canViewRecording, and the visible
// reviews newest-first. The math + gate live server-side (lib/airwaves/reviews); this renders the result and
// calls the gated actions. After a write it refreshes the server data (router.refresh), the same pattern the
// listing Q&A uses through revalidatePath.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Star, Trash2 } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import type { ReviewAggregate } from '@/lib/spaces/reviews-aggregate'
import type { RecordingReview } from '@/lib/airwaves/reviews'
import { submitRecordingReviewAction, deleteRecordingReviewAction } from '@/lib/airwaves/review-actions'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** A row of five stars, `value` filled. `onPick` (when set) makes them an input. */
function Stars({
  value,
  onPick,
  size = 'sm',
}: {
  value: number
  onPick?: (n: number) => void
  size?: 'sm' | 'lg'
}) {
  const cls = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4'
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value)
        const star = (
          <Star
            className={`${cls} ${filled ? 'fill-primary text-primary' : 'text-subtle'}`}
            aria-hidden
          />
        )
        return onPick ? (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className="rounded p-0.5 transition-transform hover:scale-110"
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        )
      })}
    </span>
  )
}

export function RecordingReviews({
  recordingId,
  aggregate,
  reviews,
  myReview,
  canRate,
  canModerate,
  myProfileId,
}: {
  recordingId: string
  aggregate: ReviewAggregate
  reviews: RecordingReview[]
  myReview: RecordingReview | null
  /** Viewer is signed in and may leave/replace a rating. */
  canRate: boolean
  /** Viewer may remove any review (the owning-Space owner). */
  canModerate: boolean
  myProfileId: string | null
}) {
  const router = useRouter()
  const [rating, setRating] = useState<number>(myReview?.rating ?? 0)
  const [body, setBody] = useState<string>(myReview?.body ?? '')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function submit() {
    if (pending) return
    if (!(rating >= 1 && rating <= 5)) {
      setError('Pick a rating from 1 to 5 stars.')
      return
    }
    setError('')
    startTransition(async () => {
      const res = await submitRecordingReviewAction(recordingId, rating, body)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function remove(reviewId: string) {
    if (pending) return
    startTransition(async () => {
      const res = await deleteRecordingReviewAction(reviewId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-bold text-text">Ratings</h2>
        {aggregate.average != null && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Stars value={aggregate.average} />
            <span className="font-semibold text-text">{aggregate.average.toFixed(1)}</span>
            <span className="text-subtle">
              ({aggregate.count} rating{aggregate.count === 1 ? '' : 's'})
            </span>
          </span>
        )}
      </div>

      {canRate ? (
        <div className="mb-4 rounded-2xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted">
              {myReview ? 'Your rating' : 'Rate this recording'}
            </span>
            <Stars value={rating} onPick={setRating} size="lg" />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note (optional)."
            rows={2}
            disabled={pending}
            className="mt-2 w-full resize-none rounded-lg bg-transparent text-sm leading-relaxed text-text/90 outline-none placeholder:text-subtle disabled:opacity-60"
          />
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
          <div className="mt-2 flex justify-end border-t border-border pt-2">
            <button
              type="button"
              onClick={submit}
              disabled={pending || rating < 1}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? 'Saving...' : myReview ? 'Update rating' : 'Post rating'}
            </button>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-subtle">Sign in to rate this recording.</p>
      )}

      {reviews.length === 0 ? (
        <p className="text-sm text-subtle">No ratings yet.</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => {
            const a = r.author
            const canDelete = canModerate || (myProfileId != null && a?.id === myProfileId)
            return (
              <li key={r.id} className="flex gap-3">
                {a?.avatarUrl ? (
                  <Image
                    src={a.avatarUrl}
                    alt={a.displayName}
                    width={32}
                    height={32}
                    unoptimized
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-bg text-2xs font-bold text-primary-strong select-none">
                    {a ? getInitials(a.displayName) : '?'}
                  </div>
                )}
                <div className="min-w-0 flex-1 rounded-2xl border border-border bg-surface px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      {a ? (
                        <Link href={`/people/${a.handle}`} className="text-sm font-semibold text-text hover:underline">
                          {a.displayName}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-text">A member</span>
                      )}
                      <Stars value={r.rating} />
                      <span className="text-2xs text-subtle">{timeAgo(r.createdAt)}</span>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        disabled={pending}
                        aria-label="Remove rating"
                        className="shrink-0 rounded-lg p-1 text-subtle transition-colors hover:text-danger disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {r.body && (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-text/90">{r.body}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
