'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { BadgeCheck, Loader2, Star } from 'lucide-react'
import { submitProductReviewAction } from '@/app/(main)/marketplace/review-actions'
import { hideProductReviewAction } from '@/app/(main)/admin/marketplace/actions'
import { isError } from '@/lib/action-result'
import type { ProductReviewsData } from '@/lib/commerce/reviews'

// The reviews block on a Market listing / Space Shop item (Phase 8). Public read: the rating summary
// + the review wall. A signed-in member (not the seller) leaves ONE review they can revise
// (submitProductReviewAction upserts). An operator may hide a review (reversible). Semantic DAWN
// tokens only, voice canon (no em dashes).

const inputCls =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-primary'

/** A read-only row of 5 stars filled to `value` (rounded). */
export function Stars({ value, className = 'h-4 w-4' }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${className} ${n <= Math.round(value) ? 'fill-primary text-primary' : 'text-subtle'}`}
          aria-hidden
        />
      ))}
    </span>
  )
}

export function ProductReviews({
  productId,
  productTitle,
  reviews,
  myReview,
  signedIn,
  canReview,
  canModerate,
}: {
  productId: string
  productTitle: string
  reviews: ProductReviewsData
  myReview: { rating: number; body: string } | null
  signedIn: boolean
  canReview: boolean
  canModerate: boolean
}) {
  return (
    <div className="mt-6 space-y-5">
      <h2 className="text-lg font-bold text-text">Reviews</h2>

      {/* Summary */}
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="text-center">
          <div className="text-3xl font-bold tabular-nums text-text">
            {reviews.average != null ? reviews.average.toFixed(1) : '--'}
          </div>
          <Stars value={reviews.average ?? 0} />
        </div>
        <div className="text-sm text-muted">
          {reviews.count > 0
            ? `${reviews.count} review${reviews.count === 1 ? '' : 's'}`
            : `Be the first to review ${productTitle}.`}
        </div>
      </div>

      {/* Write / update a review */}
      {canReview ? (
        <ReviewForm productId={productId} initial={myReview} />
      ) : !signedIn ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-elevated/50 p-4">
          <p className="text-sm text-muted">Sign in to leave a review.</p>
          <Link
            href="/login"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Sign in
          </Link>
        </div>
      ) : null}

      {/* The review wall */}
      {reviews.latest.length > 0 ? (
        <ul className="space-y-3">
          {reviews.latest.map((r) => (
            <li key={r.id} className="space-y-1.5 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
                  {r.author?.displayName ?? 'Member'}
                  {r.verifiedPurchase && (
                    <span className="inline-flex items-center gap-1 text-success" title="Verified purchase">
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                      <span className="text-2xs font-semibold">Verified purchase</span>
                    </span>
                  )}
                </span>
                <Stars value={r.rating} />
              </div>
              {r.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{r.body}</p>}
              {canModerate && <HideButton id={r.id} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No reviews yet.
        </p>
      )}
    </div>
  )
}

/** The star-rating + body form. Upserts through submitProductReviewAction; prefilled with the
 *  member's existing review so they revise rather than duplicate. */
function ReviewForm({ productId, initial }: { productId: string; initial: { rating: number; body: string } | null }) {
  const [rating, setRating] = useState(initial?.rating ?? 0)
  const [hover, setHover] = useState(0)
  const [body, setBody] = useState(initial?.body ?? '')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () => {
    setError(null)
    setNote(null)
    if (rating < 1) {
      setError('Pick a rating first.')
      return
    }
    start(async () => {
      const res = await submitProductReviewAction(productId, { rating, body })
      if (isError(res)) setError(res.error)
      else setNote('Thanks. Your review is live.')
    })
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm font-semibold text-text">{initial ? 'Update your review' : 'Leave a review'}</p>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
            className="p-0.5"
          >
            <Star
              className={`h-6 w-6 ${n <= (hover || rating) ? 'fill-primary text-primary' : 'text-subtle'}`}
              aria-hidden
            />
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share what the product or service was like (optional)"
        rows={3}
        maxLength={2000}
        className={inputCls}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      {note && (
        <p className="text-xs text-success" role="status">
          {note}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {initial ? 'Update review' : 'Post review'}
        </button>
      </div>
    </div>
  )
}

/** Operator moderation: hide a review (reversible; sets status hidden). */
function HideButton({ id }: { id: string }) {
  const [hidden, setHidden] = useState(false)
  const [pending, start] = useTransition()
  if (hidden) return <p className="text-2xs text-subtle">Hidden.</p>
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await hideProductReviewAction(id)
          setHidden(true)
        })
      }
      className="text-2xs font-semibold text-subtle hover:text-danger disabled:opacity-60"
    >
      {pending ? 'Hiding' : 'Hide'}
    </button>
  )
}
