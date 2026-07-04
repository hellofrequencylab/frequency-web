'use client'

import { useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { Check, Lock } from 'lucide-react'
import { currentStepIndex, type FeatureTierLadder } from '@/lib/pricing/feature-tiers'

// FEATURE TIER RANGE (ADR-518 Phase G, owner directive #9). The reusable "after freemium" affordance: a
// segmented RANGE selector across a feature's tiers (Free → paid) that shows, for each tier, what it
// unlocks and its price point, highlights the viewer's current tier, and offers a single upgrade CTA.
//
// BILLING IS ON HOLD (ADR-518). This component NEVER charges. `ladder.placeholderPricing` (true today)
// means the prices are a preview; an honest note says so. The CTA is a plain Link to the billing/upgrade
// surface (`upgradeHref`), never a checkout. When `live` is false (billing not live) the CTA reads as a
// preview link; either way it only navigates. The single go-live switch is PLACEHOLDER_PRICING +
// billing_live (lib/pricing/feature-tiers.ts + lib/pricing/settings.ts); this component reads, never sets.
//
// It READS the real tiers: the caller resolves the viewer's current tier (the Space plan or membership
// tier) and passes it in, so the highlight + the "you're on this plan" state reflect reality.
//
// ACCESSIBLE: the tiers are a radiogroup (roving tabindex, arrow / Home / End keys, aria-checked). It is
// DISPLAY + NAVIGATION only: no server action, no mutation, so it weakens no gate. Semantic DAWN tokens
// only, no hardcoded hex. Copy per docs/CONTENT-VOICE.md: plain, honest, no em dashes, no urgency.

export interface FeatureTierRangeProps {
  /** The feature's built tier ladder (lib/pricing/feature-tiers.ts featureTierLadder). Serializable. */
  ladder: FeatureTierLadder
  /** The viewer's CURRENT tier on this ladder's axis (the Space plan or membership tier). */
  currentTier: string
  /** Where the upgrade CTA links (the billing/upgrade surface). Never a checkout. */
  upgradeHref: string
  /** Is billing actually live? Only changes the CTA copy (preview vs live); the CTA never charges. */
  live?: boolean
}

/** The segmented tier range for one feature. Renders the ladder with the current tier highlighted, each
 *  tier's unlock + placeholder price, and an upgrade CTA that only navigates. */
export function FeatureTierRange({ ladder, currentTier, upgradeHref, live = false }: FeatureTierRangeProps) {
  const currentIdx = currentStepIndex(ladder, currentTier)
  // Start the selection on the first rung the viewer does NOT already have (the natural next step), or the
  // current rung when they are already at the top.
  const initial = Math.min(currentIdx + 1, ladder.steps.length - 1)
  const [selected, setSelected] = useState(initial)

  const step = ladder.steps[selected]!
  const isCurrent = selected === currentIdx
  const isBelowCurrent = selected < currentIdx

  function move(next: number) {
    const clamped = Math.max(0, Math.min(ladder.steps.length - 1, next))
    setSelected(clamped)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        move(selected + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        move(selected - 1)
        break
      case 'Home':
        e.preventDefault()
        move(0)
        break
      case 'End':
        e.preventDefault()
        move(ladder.steps.length - 1)
        break
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-subtle">{ladder.title} plans</p>

      {/* The segmented range: one radio per tier. Roving tabindex + arrow keys. */}
      <div
        role="radiogroup"
        aria-label={`${ladder.title} plans`}
        onKeyDown={onKeyDown}
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {ladder.steps.map((s, i) => {
          const checked = i === selected
          const viewerHere = i === currentIdx
          return (
            <button
              key={s.tier}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => setSelected(i)}
              className={[
                'flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors',
                checked
                  ? 'border-primary bg-primary-bg/60 ring-1 ring-primary'
                  : 'border-border bg-surface-elevated/40 hover:bg-surface-elevated/70',
              ].join(' ')}
            >
              <span className="flex w-full items-center justify-between gap-1">
                <span className="text-sm font-semibold text-text">{s.label}</span>
                {viewerHere && (
                  <Check className="h-3.5 w-3.5 text-primary-strong" aria-hidden />
                )}
              </span>
              <span className="mt-0.5 text-sm font-bold text-text">{s.price}</span>
              {viewerHere && <span className="mt-0.5 text-2xs font-medium text-primary-strong">Your plan</span>}
            </button>
          )
        })}
      </div>

      {/* The selected tier's unlock line. */}
      <p className="mt-3 flex items-start gap-2 text-sm text-muted">
        {step.unlocked ? (
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
        ) : (
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
        )}
        <span>
          <span className="font-semibold text-text">{step.label}:</span> {step.unlocks}
        </span>
      </p>

      {/* The CTA. Never charges: it links to the billing/upgrade surface. Hidden for a tier the viewer is
          already on or below (nothing to upgrade to there). */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {isCurrent ? (
          <p className="text-sm font-medium text-muted">You are on the {step.label} plan.</p>
        ) : isBelowCurrent ? (
          <p className="text-sm font-medium text-muted">Included on your current plan.</p>
        ) : (
          <Link
            href={upgradeHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            See {step.label} plans
          </Link>
        )}
      </div>

      {/* Honest about placeholder / beta pricing. No urgency, no dark pattern. */}
      {ladder.placeholderPricing && (
        <p className="mt-2 text-2xs text-subtle">
          {live
            ? 'Prices shown are placeholders while we finish setting up billing. Nothing is charged here.'
            : 'Billing is not live yet. Prices are placeholders for preview, and nothing is charged.'}
        </p>
      )}
    </section>
  )
}
