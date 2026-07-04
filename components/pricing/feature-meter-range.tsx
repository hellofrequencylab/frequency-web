'use client'

import { useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { Check, Gauge } from 'lucide-react'
import {
  currentMeterStepIndex,
  allowanceReadout,
  type FeatureMeterLadder,
} from '@/lib/pricing/feature-meters'

// FEATURE METER RANGE (ADR-519, owner directive #4). The reusable "pay to play" affordance: a segmented
// RANGE across a feature's tiers that shows, for each tier, its ALLOWANCE on the usage dimension (up to N
// contacts / sends per month / seats …) + its price point, highlights the viewer's current tier, and
// offers a single "upgrade for more" CTA. It reframes the old lock/upsell from "unlock feature X" to
// "you're on the free allowance, upgrade for more" — nothing is locked, you pay to use MORE.
//
// NOTHING CHARGES / NOTHING BLOCKS (ADR-519). The meter is INFORMATIONAL / preview. The CTA is a plain
// Link to the billing/upgrade surface (`upgradeHref`), never a checkout. `ladder.placeholderAllowances`
// (true today) means the numbers are preview; an honest note says so. The real enforcement seam is
// `withinAllowance` (lib/pricing/feature-meters.ts), which never hard-blocks while billing is off; this
// component reads the ladder, it enforces nothing.
//
// It READS the real tiers: the caller resolves the viewer's current tier (the Space plan / membership
// tier) and passes it in, so the highlight + "your plan" state reflect reality. An OPTIONAL `usage` count
// (when a real signal is cheaply available) renders a "X of N used" readout for the current tier.
//
// ACCESSIBLE: the tiers are a radiogroup (roving tabindex, arrow / Home / End keys, aria-checked). It is
// DISPLAY + NAVIGATION only: no server action, no mutation, so it weakens no gate. Semantic DAWN tokens
// only, no hardcoded hex. Copy per docs/CONTENT-VOICE.md: plain, honest, no em dashes, no urgency.

export interface FeatureMeterRangeProps {
  /** The feature's built usage-meter ladder (lib/pricing/feature-meters.ts featureMeter). Serializable. */
  ladder: FeatureMeterLadder
  /** The viewer's CURRENT tier on this ladder's axis (the Space plan or membership tier). */
  currentTier: string
  /** Where the upgrade CTA links (the billing/upgrade surface). Never a checkout. */
  upgradeHref: string
  /** Is billing actually live? Only changes the note copy (preview vs live); the CTA never charges. */
  live?: boolean
  /** OPTIONAL current usage on the meter dimension, when a real count is cheaply available. Renders a
   *  "X of N used" readout for the viewer's current tier. Informational only; it blocks nothing. */
  usage?: number
}

/** The segmented usage-meter range for one feature. Renders the allowance ladder with the current tier
 *  highlighted, each tier's allowance + placeholder price, an optional usage readout, and an "upgrade for
 *  more" CTA that only navigates. */
export function FeatureMeterRange({ ladder, currentTier, upgradeHref, live = false, usage }: FeatureMeterRangeProps) {
  const currentIdx = currentMeterStepIndex(ladder, currentTier)
  // Start the selection on the first rung ABOVE the viewer's current tier (the natural next step, "more
  // allowance"), or the current rung when they are already at the top.
  const initial = Math.min(currentIdx + 1, ladder.steps.length - 1)
  const [selected, setSelected] = useState(initial)

  const step = ladder.steps[selected]!
  const isCurrent = selected === currentIdx
  const isBelowCurrent = selected < currentIdx
  const readout = typeof usage === 'number' ? allowanceReadout(ladder.featureKey, currentTier, usage) : null

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
      <p className="text-xs font-semibold uppercase tracking-widest text-subtle">{ladder.dimension} allowance</p>

      {/* The OPTIONAL usage readout: "X of N used" on the viewer's current tier. Informational only. */}
      {readout && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <Gauge className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <span>{readout}</span>
        </p>
      )}

      {/* The segmented range: one radio per tier. Roving tabindex + arrow keys. */}
      <div
        role="radiogroup"
        aria-label={`${ladder.dimension} allowance by plan`}
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
                {viewerHere && <Check className="h-3.5 w-3.5 text-primary-strong" aria-hidden />}
              </span>
              <span className="mt-0.5 text-sm font-bold text-text">{s.price}</span>
              {viewerHere && <span className="mt-0.5 text-2xs font-medium text-primary-strong">Your plan</span>}
            </button>
          )
        })}
      </div>

      {/* The selected tier's allowance line. Every tier reads as "how much", never as locked. */}
      <p className="mt-3 flex items-start gap-2 text-sm text-muted">
        <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
        <span>
          <span className="font-semibold text-text">{step.label}:</span> {step.allowanceText}
        </span>
      </p>

      {/* The CTA. Never charges: it links to the billing/upgrade surface. For a tier the viewer is on or
          below, there is nothing more to buy there, so it reads as an informational line. */}
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
            Upgrade for more
          </Link>
        )}
      </div>

      {/* Honest that the numbers are placeholders and nothing charges or blocks. No urgency, no dark
          pattern. */}
      {ladder.placeholderAllowances && (
        <p className="mt-2 text-2xs text-subtle">
          {live
            ? 'These allowances are a preview while we finish setting up billing. Nothing is charged or limited here.'
            : 'Billing is not live yet. These allowances are a preview, and nothing is charged or limited.'}
        </p>
      )}
    </section>
  )
}
