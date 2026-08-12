'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE TWO REVIEW-STEP OFFERS (ADR-993, ADR-995).
//
// A drawn cover, and a second read before it goes out. Both were built and neither was reachable:
// `SparkReview` declared the props and no screen passed them, so the engine (lib/loom/cover*.ts)
// and the gate (lib/ai/quality-gate*.ts) shipped with no door. These are the doors.
//
// They live in their OWN file, not inside the review board, because four of the five wizards keep
// a bespoke review step (a Journey's weekly arc, a Practice's Pillars and timer, an Event's
// conditional price row) and would otherwise each hand-roll the same two cards. One card, one
// wording, five surfaces. `SparkReview` renders these too, so its consumers change nothing.
//
// THE TWO LAWS THEY KEEP
//   1. BOTH ARE OFFERS. Neither blocks finishing. Publishing with no image is a first-class
//      outcome, and a draft nobody has read is still publishable. Nothing here disables a
//      Continue button, and nothing here writes anything.
//   2. THE VERDICT IS ADVICE. It is shown, it is not a gate, and it persists nothing. The entity
//      that knows what a verdict COSTS decides that (a Journey's rank), not this card.
//
// The label on a generated cover is not this file's job to invent: the asset is filed in the Loom
// tagged 'generated' with 'recraft' as its source (docs/AI-VERA.md §10), and the card repeats it
// in plain words so the author reads the same claim the catalog carries.
//
// Voice canon (docs/CONTENT-VOICE.md): plain, second person, no em dashes.
// ─────────────────────────────────────────────────────────────────────────────

import { ImageIcon, ShieldQuestion, Sparkles, X } from 'lucide-react'
import { safeImageSrc } from '@/lib/safe-image-src'

/** The "Vera can draw one" offer, when the entity declares a cover field and the draft has none.
 *  Omit it and no offer renders. It is an OFFER: publishing with no image stays a real outcome. */
export interface SparkCoverOffer {
  label: string
  busy?: boolean
  /** Runs the generation. The surface owns applying the returned URL to the draft. */
  onGenerate: () => void
  /** The cover Vera drew and the author kept, if any. Shown so the author can judge it. */
  applied?: string | null
  /** Take it back off. Without this there is no way out of an image you did not want. */
  onRemove?: () => void
  /** A plain reason the last attempt did not land. */
  error?: string | null
}

/** The optional pre-publish read. A verdict is advice, never a gate: the entity that knows what a
 *  verdict COSTS decides that, not this board. */
export interface SparkQualityCheck {
  busy?: boolean
  onCheck: () => void
  /** `status` is already member-facing words; the raw enum never reaches a reader (NAMING.md). */
  verdict?: { status: string; score: number; notes: readonly string[] } | null
  error?: string | null
}

export interface SparkOffersProps {
  cover?: SparkCoverOffer | null
  quality?: SparkQualityCheck | null
  disabled?: boolean
  className?: string
}

/** Both offers, in the one order every Spark shows them: the picture, then the read. */
export function SparkOffers({ cover, quality, disabled, className }: SparkOffersProps) {
  if (!cover && !quality) return null
  return (
    <div className={`space-y-3${className ? ` ${className}` : ''}`}>
      {cover && <CoverCard cover={cover} disabled={disabled} />}
      {quality && <QualityCard quality={quality} disabled={disabled} />}
    </div>
  )
}

function CoverCard({ cover, disabled }: { cover: SparkCoverOffer; disabled?: boolean }) {
  const src = safeImageSrc(cover.applied)

  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
      {src ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`${cover.label}, drawn by Vera`}
            className="h-14 w-20 shrink-0 rounded-control border border-border object-cover"
          />
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-elevated px-1.5 py-0.5 text-3xs text-muted">
              <Sparkles className="h-2.5 w-2.5" aria-hidden /> Made by Vera
            </span>
            <p className="mt-1 text-meta text-muted">
              Saved to your Loom, so you can reuse it or swap it later.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={cover.onGenerate}
              disabled={disabled || cover.busy}
              className="rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
            >
              {cover.busy ? 'Drawing…' : 'Draw another'}
            </button>
            {cover.onRemove && (
              <button
                type="button"
                onClick={cover.onRemove}
                disabled={disabled || cover.busy}
                className="inline-flex items-center gap-1 rounded-control border border-border px-2.5 py-1.5 text-meta font-semibold text-muted transition-colors hover:text-text disabled:opacity-60"
              >
                <X className="h-3 w-3" aria-hidden /> Remove
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <ImageIcon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          <span className="min-w-0 flex-1 text-meta text-muted">
            No {cover.label.toLowerCase()} yet. Vera can draw one, or you can add your own later.
          </span>
          <button
            type="button"
            onClick={cover.onGenerate}
            disabled={disabled || cover.busy}
            className="shrink-0 rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
          >
            {cover.busy ? 'Drawing…' : 'Vera can draw one'}
          </button>
        </div>
      )}

      {cover.error && (
        <p className="mt-2 border-t border-border pt-2 text-meta text-danger" role="status">
          {cover.error}
        </p>
      )}
    </div>
  )
}

function QualityCard({ quality, disabled }: { quality: SparkQualityCheck; disabled?: boolean }) {
  const v = quality.verdict

  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldQuestion className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
        <span className="min-w-0 flex-1 text-meta text-muted">Want a second read before this goes out?</span>
        <button
          type="button"
          onClick={quality.onCheck}
          disabled={disabled || quality.busy}
          className="shrink-0 rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
        >
          {quality.busy ? 'Reading…' : v ? 'Read it again' : 'Check it over'}
        </button>
      </div>

      {v && (
        <div className="mt-2 border-t border-border pt-2">
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
            {v.status}
            {/* A score of 0 is the fail-closed placeholder, not a mark out of 100, so it is not
                shown as one. */}
            {v.score > 0 && ` · ${v.score} out of 100`}
          </p>
          {v.notes.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {v.notes.map((n, i) => (
                <li key={i} className="text-meta leading-snug text-muted">
                  {n}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-3xs text-muted">
            This is advice. Nothing is saved, and you can carry on either way.
          </p>
        </div>
      )}

      {quality.error && (
        <p className="mt-2 border-t border-border pt-2 text-meta text-danger" role="status">
          {quality.error}
        </p>
      )}
    </div>
  )
}
