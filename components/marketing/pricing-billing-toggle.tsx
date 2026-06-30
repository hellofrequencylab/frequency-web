'use client'

// The monthly/yearly toggle for the commercial pricing table (Phase F1). The ONLY client island on the
// otherwise fully-static /pricing page. It holds no price data: the page renders BOTH the monthly and
// the yearly price for every cell at build time (statically, from the CODE catalog), each wrapped in a
// span marked with `data-interval`. This toggle just flips a single state and writes it as a
// `data-interval` attribute on the wrapper element it controls; CSS in the page hides the inactive
// interval. So there is zero per-request work and no hydration cost beyond a button group.
//
// Accessible: a labelled radiogroup of two buttons, the active one marked aria-pressed. Semantic DAWN
// tokens only (no hex). Voice: plain labels, no em dashes.

import { useState } from 'react'

export type BillingIntervalUI = 'month' | 'year'

/**
 * Render the toggle and wrap the price content it controls. The children are rendered inside a wrapper
 * that carries `data-interval`; the page's CSS shows the matching `[data-interval-show]` spans. Default
 * is monthly (the low-friction default per PRICING-LADDER-PLAN §1a).
 */
export function PricingBillingToggle({
  children,
  yearlyNote = 'Yearly is two months free.',
}: {
  children: React.ReactNode
  yearlyNote?: string
}) {
  const [interval, setInterval] = useState<BillingIntervalUI>('month')

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Billing interval"
        className="mx-auto mb-8 flex w-fit items-center gap-1 rounded-2xl border border-border bg-surface p-1"
      >
        <IntervalButton
          active={interval === 'month'}
          onClick={() => setInterval('month')}
          label="Monthly"
        />
        <IntervalButton
          active={interval === 'year'}
          onClick={() => setInterval('year')}
          label="Yearly"
        />
      </div>
      {interval === 'year' && (
        <p className="mb-8 -mt-4 text-center text-sm font-semibold text-primary-strong">{yearlyNote}</p>
      )}
      <div data-interval={interval}>{children}</div>
    </div>
  )
}

function IntervalButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-xl px-5 py-2 text-sm font-bold transition-colors ${
        active ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  )
}
