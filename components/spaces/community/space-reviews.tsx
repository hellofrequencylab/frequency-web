'use client'

import { useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { BadgeCheck, Loader2, Star } from 'lucide-react'
import { submitSpaceReview, hideSpaceReview, respondToSpaceReview } from '@/lib/spaces/content-actions'
import { isError } from '@/lib/action-result'
import { relativeTime } from '@/lib/utils'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import type { SpaceReviewsData, SpaceReviewItem, SpaceReviewResponse } from '@/lib/spaces/content-data'

// THE REVIEWS TAB body (redesign). A best-in-class review experience: a rating summary with a per-star
// distribution, a sortable review wall where each member card carries a Member badge + relative date,
// and an inline Space-admin RESPONSE under each review (the top trust signal). Public read; a signed-in
// member who is NOT the owner leaves ONE review they can revise (submitSpaceReview upserts); an operator
// may hide a review (hideSpaceReview) and reply to it (respondToSpaceReview). Semantic DAWN tokens only,
// voice canon (no em or en dashes).

const inputCls =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-primary'

type SortKey = 'recent' | 'highest' | 'lowest'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Most recent' },
  { key: 'highest', label: 'Highest' },
  { key: 'lowest', label: 'Lowest' },
]

/** A read-only row of 5 stars filled to `value` (rounded). */
function Stars({ value, className = 'h-4 w-4' }: { value: number; className?: string }) {
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

/** A small round avatar (image when present, else the name's initial). */
function Avatar({ name, avatarUrl, size = 36 }: { name: string; avatarUrl: string | null; size?: number }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-primary-bg text-sm font-semibold text-primary-strong"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || 'M'}
    </span>
  )
}

/** The "Member" trust chip: this reviewer is a real, signed-in Frequency member (never an anonymous
 *  drop-in). Reuses the BadgeCheck glyph the VerifiedBadge uses, on semantic tokens. */
function MemberBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-1.5 py-0.5 text-2xs font-semibold text-primary-strong"
      title="A Frequency member"
    >
      <BadgeCheck className="h-3 w-3" aria-hidden />
      Member
    </span>
  )
}

export function SpaceReviews({
  slug,
  spaceName,
  spaceLogoUrl,
  reviews,
  myReview,
  signedIn,
  canReview,
  canModerate,
  canRespond,
}: {
  slug: string
  spaceName: string
  spaceLogoUrl: string | null
  reviews: SpaceReviewsData
  myReview: { rating: number; body: string } | null
  signedIn: boolean
  canReview: boolean
  canModerate: boolean
  canRespond: boolean
}) {
  const [sort, setSort] = useState<SortKey>('recent')

  const sorted = useMemo(() => {
    const list = [...reviews.all]
    if (sort === 'highest') list.sort((a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt))
    else if (sort === 'lowest') list.sort((a, b) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt))
    // 'recent' keeps the server order (already newest first).
    return list
  }, [reviews.all, sort])

  const hasReviews = reviews.count > 0

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Rating summary: big average + stars + count, beside the per-star distribution. */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        {hasReviews ? (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex shrink-0 flex-col items-center gap-1 sm:w-32">
              <div className="text-5xl font-bold tabular-nums leading-none text-text">
                {reviews.average != null ? reviews.average.toFixed(1) : '--'}
              </div>
              <Stars value={reviews.average ?? 0} className="h-4 w-4" />
              <p className="text-xs text-muted">
                {reviews.count} review{reviews.count === 1 ? '' : 's'}
              </p>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {([5, 4, 3, 2, 1] as const).map((star) => {
                const n = reviews.distribution[star]
                const pct = reviews.count > 0 ? Math.round((n / reviews.count) * 100) : 0
                return (
                  <div key={star} className="flex items-center gap-2">
                    <span className="flex w-8 shrink-0 items-center gap-0.5 text-xs tabular-nums text-muted">
                      {star}
                      <Star className="h-3 w-3 fill-subtle text-subtle" aria-hidden />
                    </span>
                    <span
                      className="h-2 flex-1 overflow-hidden rounded-full bg-surface-elevated"
                      role="img"
                      aria-label={`${star} star: ${n} review${n === 1 ? '' : 's'}`}
                    >
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-subtle">{n}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Stars value={0} />
            <span>No ratings yet for {spaceName}.</span>
          </div>
        )}
      </section>

      {/* Write / update a review */}
      {canReview ? (
        <ReviewForm slug={slug} initial={myReview} />
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
      {hasReviews ? (
        <section>
          <SectionHeader
            title="What members say"
            count={reviews.count}
            action={
              <div className="flex items-center gap-1" role="group" aria-label="Sort reviews">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSort(s.key)}
                    aria-pressed={sort === s.key}
                    className={`rounded-lg px-2 py-1 text-2xs font-semibold transition-colors ${
                      sort === s.key
                        ? 'bg-primary-bg text-primary-strong'
                        : 'text-subtle hover:text-text'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            }
          />
          <ul className="space-y-3">
            {sorted.map((r) => (
              <ReviewCard
                key={r.id}
                slug={slug}
                review={r}
                spaceName={spaceName}
                spaceLogoUrl={spaceLogoUrl}
                canModerate={canModerate}
                canRespond={canRespond}
              />
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          icon={Star}
          title={canReview ? `Be the first to review ${spaceName}` : `No reviews yet`}
          description={
            canReview
              ? 'Share what your visit was like. Your review helps other members know what to expect.'
              : signedIn
                ? 'Reviews from members show up here as they leave them.'
                : `Sign in to be the first to review ${spaceName}.`
          }
        />
      )}
    </div>
  )
}

/** One review card: the reviewer, their rating + date + body, the Space-admin reply (inline), and the
 *  operator controls (respond, hide). */
function ReviewCard({
  slug,
  review,
  spaceName,
  spaceLogoUrl,
  canModerate,
  canRespond,
}: {
  slug: string
  review: SpaceReviewItem
  spaceName: string
  spaceLogoUrl: string | null
  canModerate: boolean
  canRespond: boolean
}) {
  const [hidden, setHidden] = useState(false)
  const name = review.author?.displayName ?? 'Member'

  if (hidden) return <li className="rounded-2xl border border-dashed border-border p-4 text-2xs text-subtle">Hidden.</li>

  return (
    <li className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={name} avatarUrl={review.author?.avatarUrl ?? null} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-text">{name}</span>
              <MemberBadge />
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <Stars value={review.rating} className="h-3.5 w-3.5" />
              {review.createdAt && <span className="text-2xs text-subtle">{relativeTime(review.createdAt)}</span>}
            </div>
          </div>
        </div>
        {canModerate && <HideButton slug={slug} id={review.id} onHidden={() => setHidden(true)} />}
      </div>

      {review.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{review.body}</p>}

      <ResponseBlock
        slug={slug}
        reviewId={review.id}
        initial={review.response}
        spaceName={spaceName}
        spaceLogoUrl={spaceLogoUrl}
        canRespond={canRespond}
      />
    </li>
  )
}

/** The Space-admin reply under a review: renders the response card when one exists, and (for an
 *  operator) the Respond / Edit reply / Remove reply affordances with an inline composer. Optimistic
 *  local state so the reply appears/updates without a full refresh. */
function ResponseBlock({
  slug,
  reviewId,
  initial,
  spaceName,
  spaceLogoUrl,
  canRespond,
}: {
  slug: string
  reviewId: string
  initial: SpaceReviewResponse | null
  spaceName: string
  spaceLogoUrl: string | null
  canRespond: boolean
}) {
  const [response, setResponse] = useState<SpaceReviewResponse | null>(initial)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial?.body ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = () => {
    setError(null)
    const body = draft.trim()
    if (!body) {
      setError('Write a reply first.')
      return
    }
    start(async () => {
      const res = await respondToSpaceReview(slug, reviewId, body)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setResponse({ body, at: new Date().toISOString(), author: { displayName: spaceName, avatarUrl: spaceLogoUrl } })
      setEditing(false)
    })
  }

  const remove = () => {
    setError(null)
    start(async () => {
      const res = await respondToSpaceReview(slug, reviewId, '')
      if (isError(res)) {
        setError(res.error)
        return
      }
      setResponse(null)
      setDraft('')
      setEditing(false)
    })
  }

  return (
    <div className="space-y-2">
      {response && !editing && (
        <div className="rounded-xl border border-border bg-surface-elevated/60 p-3">
          <div className="flex items-center gap-2">
            <Avatar name={spaceName} avatarUrl={response.author?.avatarUrl ?? spaceLogoUrl} size={24} />
            <span className="text-xs font-semibold text-text">Response from {spaceName}</span>
            {response.at && <span className="text-2xs text-subtle">{relativeTime(response.at)}</span>}
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">{response.body}</p>
          {canRespond && (
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraft(response.body)
                  setEditing(true)
                }}
                className="text-2xs font-semibold text-subtle hover:text-primary-strong"
              >
                Edit reply
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="text-2xs font-semibold text-subtle hover:text-danger disabled:opacity-60"
              >
                Remove reply
              </button>
            </div>
          )}
        </div>
      )}

      {canRespond && !response && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-2xs font-semibold text-subtle hover:text-primary-strong"
        >
          Respond
        </button>
      )}

      {canRespond && editing && (
        <div className="space-y-2 rounded-xl border border-border bg-surface-elevated/60 p-3">
          <p className="text-xs font-semibold text-text">Response from {spaceName}</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply as the space. Thank them, or answer what they raised."
            rows={3}
            maxLength={2000}
            className={inputCls}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setDraft(response?.body ?? '')
                setError(null)
              }}
              className="rounded-lg px-3 py-1.5 text-2xs font-semibold text-subtle hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-2xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {response ? 'Save reply' : 'Post reply'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The star-rating + body form. Upserts through submitSpaceReview; prefilled with the member's existing
 *  review so they revise rather than duplicate. */
function ReviewForm({ slug, initial }: { slug: string; initial: { rating: number; body: string } | null }) {
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
      const res = await submitSpaceReview(slug, { rating, body })
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
            <Star className={`h-6 w-6 ${n <= (hover || rating) ? 'fill-primary text-primary' : 'text-subtle'}`} aria-hidden />
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share what your visit was like (optional)"
        rows={3}
        maxLength={2000}
        className={inputCls}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      {note && <p className="text-xs text-success" role="status">{note}</p>}
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
function HideButton({ slug, id, onHidden }: { slug: string; id: string; onHidden: () => void }) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await hideSpaceReview(slug, id)
          if (!isError(res)) onHidden()
        })
      }
      className="shrink-0 text-2xs font-semibold text-subtle hover:text-danger disabled:opacity-60"
    >
      {pending ? 'Hiding' : 'Hide'}
    </button>
  )
}
