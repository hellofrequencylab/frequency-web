'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE WIRING BEHIND THE TWO OFFERS (ADR-993, ADR-995).
//
// `spark-offers.tsx` is the two cards. This is the plumbing behind them, in one place, so five
// wizards share one set of rules instead of five readings of the same ADR:
//
//   useCoverOffer   asks whether a cover may be offered AT ALL (`coverOfferAvailableAction`:
//                   Recraft configured, the AI kill switch on, the 'entity-cover' cap unspent,
//                   and the entity actually declaring a fillable image field), then draws one
//                   through `generateEntityCoverAction`, which files it in the author's Loom
//                   (ADR-987) and hands back the URL plus the provenance that marks it AI-made.
//                   IT NEVER WRITES THE DRAFT. The surface does, in `onApply`, which is what
//                   keeps a generated image from ever appearing without someone accepting it.
//
//   useQualityCheck runs `reviewEntityDraftAction` on the draft as plain text and keeps the
//                   verdict in memory. It persists nothing, it gates nothing, and it never
//                   disables a Continue button.
//
// THE STATUS WORDS: `QualityVerdict.status` is a raw enum ('approved' / 'rejected' / 'pending').
// A raw enum slug never reaches a reader (docs/NAMING.md), and 'pending' in particular does not
// mean "waiting" here, it means the read could not run. Mapped once, below.
//
// Voice canon (docs/CONTENT-VOICE.md): plain, no em dashes.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { isError } from '@/lib/action-result'
import { coverOffer, type CoverOffer } from '@/lib/loom/cover'
import { coverOfferAvailableAction, generateEntityCoverAction } from '@/lib/loom/cover-actions'
import type { GeneratedCover } from '@/lib/loom/cover-actions'
import { reviewEntityDraftAction } from '@/lib/ai/quality-gate-actions'
import type { EntityManifest } from '@/lib/studio/kernel/manifest'
import type { FieldModel } from '@/lib/studio/kernel/review-kernel'
import type { SparkCoverOffer, SparkQualityCheck } from './spark-offers'

// ── The cover offer ──────────────────────────────────────────────────────────────────────

export interface UseCoverOfferInput {
  /** The Studio entity id. Its manifest decides whether a drawn cover is allowed at all. */
  entity: string
  manifest: EntityManifest
  /** The draft in the manifest's own shape, so `coverOffer` can see whether it already has an
   *  image. A surface that keeps no image of its own passes an empty record, truthfully. */
  draft: Record<string, unknown>
  /** What Vera draws from. Read at click time, so a title typed a second ago is the one used. */
  subject: {
    title: string
    summary?: string | null
    mood?: string | null
    directions?: string | null
  }
  /** Which Loom to file into: a Space id/slug the caller manages, else the caller's own. */
  scopeKey?: string | null
  /** Put the URL on the draft and merge `cover.provenance` into the ledger under `cover.path`.
   *  Doing this in the surface, not here, is the ADR-993 law that keeps this from being an
   *  autonomous write. */
  onApply: (cover: GeneratedCover, offer: CoverOffer) => void
  /** Take it back off the draft. Publishing with no image stays a first-class outcome. */
  onRemove?: (cover: GeneratedCover) => void
}

export interface CoverOfferState {
  /** The card's props, or null when nothing should be offered here. */
  offer: SparkCoverOffer | null
  /** The cover Vera drew and the author kept, so the surface can carry it into its create call. */
  applied: GeneratedCover | null
}

/**
 * The "Vera can draw one" offer for a review step. Returns `offer: null` whenever there is nothing
 * honest to offer: the entity declares no fillable image field, the author already supplied one,
 * Recraft is unconfigured, Vera is paused, or the daily cap is spent. A button that would only
 * fail is worse than no button.
 */
export function useCoverOffer(input: UseCoverOfferInput): CoverOfferState {
  const { entity, manifest, draft, subject, scopeKey, onApply, onRemove } = input

  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<GeneratedCover | null>(null)
  // The offer the applied cover was drawn for, kept so the card keeps its label once the URL is
  // on the draft and `coverOffer` correctly stops asking.
  const [used, setUsed] = useState<CoverOffer | null>(null)

  // Cheap and side-effect free on the server. Asked once per entity, before anything is painted.
  // Starts false, so the first paint never shows a button the server has not agreed to yet.
  useEffect(() => {
    let live = true
    coverOfferAvailableAction(entity)
      .then((r) => {
        if (live) setAvailable(r.available)
      })
      .catch(() => {
        if (live) setAvailable(false)
      })
    return () => {
      live = false
    }
  }, [entity])

  const want = coverOffer(manifest, draft)
  const active = want ?? used

  const generate = () => {
    if (!active || busy) return
    setBusy(true)
    setError(null)
    void (async () => {
      try {
        const res = await generateEntityCoverAction({
          entity,
          title: subject.title,
          summary: subject.summary ?? null,
          mood: subject.mood ?? null,
          directions: subject.directions ?? null,
          scopeKey: scopeKey ?? null,
        })
        if (isError(res)) {
          setError(res.error)
        } else {
          setApplied(res.data)
          setUsed(active)
          onApply(res.data, active)
        }
      } catch {
        setError('Vera could not draw one this time. Try again, or add your own image.')
      } finally {
        setBusy(false)
      }
    })()
  }

  const remove = () => {
    if (!applied) return
    onRemove?.(applied)
    setApplied(null)
    setUsed(null)
    setError(null)
  }

  return {
    applied,
    offer:
      available && active
        ? {
            label: active.label,
            busy,
            onGenerate: generate,
            applied: applied?.url ?? null,
            onRemove: applied ? remove : undefined,
            error,
          }
        : null,
  }
}

// ── The pre-publish read ─────────────────────────────────────────────────────────────────

/** The member-facing words for a verdict. 'pending' is the fail-closed state (Vera is off, over
 *  budget, or the read failed), which is why it reads as "not read", never as "waiting". */
const VERDICT_LABEL: Record<string, string> = {
  approved: 'Looks ready',
  rejected: 'Worth another pass',
  pending: 'Not read',
}

export interface UseQualityCheckInput {
  /** The Studio entity id. Its standard (lib/ai/quality-gate.ts) decides how hard the bar is. */
  entity: string
  /** The draft as plain text. Called at click time, so it always reads the current draft. */
  read: () => string
}

export interface QualityCheckState {
  /** The card's props. Always present: the read is available to any signed-in author, and every
   *  failure path comes back as plain words rather than a missing button. */
  check: SparkQualityCheck
  /** The verdict, for a surface that wants to say something else about it. Never a gate. */
  verdict: { status: string; score: number; notes: readonly string[] } | null
}

/**
 * The optional "check it over" read for a review step. Holds the verdict in memory only: nothing
 * is written, nothing is submitted, and the author can finish whatever the verdict says.
 */
export function useQualityCheck({ entity, read }: UseQualityCheckInput): QualityCheckState {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<{ status: string; score: number; notes: readonly string[] } | null>(null)

  const check = () => {
    if (busy) return
    setBusy(true)
    setError(null)
    void (async () => {
      try {
        const res = await reviewEntityDraftAction(entity, read())
        if (isError(res)) {
          setError(res.error)
        } else {
          const v = res.data.verdict
          setVerdict({
            status: VERDICT_LABEL[v.status] ?? VERDICT_LABEL.pending,
            score: v.score,
            notes: v.feedback,
          })
        }
      } catch {
        setError('Vera could not finish reading this one. Nothing changed. Ask for the read again.')
      } finally {
        setBusy(false)
      }
    })()
  }

  return { verdict, check: { busy, onCheck: check, verdict, error } }
}

// ── Rendering a draft for the read ───────────────────────────────────────────────────────

/**
 * A field model as the plain text the gate reads. The review board already holds every field as a
 * label plus a value, which is exactly the shape the standard is written against. Empty fields are
 * dropped: a gap is not something to judge the copy on, and it is input cost. PURE.
 */
export function fieldModelText(model: FieldModel): string {
  return model.sections
    .map((s) => {
      const rows = s.fields.filter((f) => f.value.trim()).map((f) => `${f.label}: ${f.value}`)
      return rows.length ? [s.title, ...rows].join('\n') : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

/** The same shape from plain pairs, for a wizard whose review step is not a field model. PURE. */
export function draftText(pairs: ReadonlyArray<readonly [string, string | null | undefined]>): string {
  return pairs
    .filter(([, value]) => !!value && value.trim().length > 0)
    .map(([label, value]) => `${label}: ${(value ?? '').trim()}`)
    .join('\n')
}
