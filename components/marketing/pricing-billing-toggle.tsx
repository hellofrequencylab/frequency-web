'use client'

// The monthly/yearly toggle for the public pricing page: the ONLY page-specific client island on the
// otherwise fully-static /pricing. It holds no price data: the page renders BOTH the monthly and the
// yearly figure for every card at build time, each wrapped in a span marked `data-interval-show`; the
// state here is written as a `data-interval` attribute on the scope wrapper and CSS in the page hides
// the inactive interval. So there is zero per-request work and no hydration cost beyond a button group.
//
// SPLIT INTO A SCOPE + A CONTROL (DAWN 2 rebuild): the plan cards now sit in TWO full-bleed bands
// (the cream member row and the ink Space row), so the old single component — which rendered the
// control directly above the children it wrapped — could no longer both sit inside the first band's
// content and govern the second band. `PricingIntervalScope` owns the state and stamps the attribute
// around everything that flips; `PricingBillingToggle` is the pill control, placed wherever the band
// layout wants it, reading the shared state through context. One state, both bands, behavior
// unchanged: default monthly (the low-friction default per PRICING-LADDER-PLAN §1a), a labelled
// radiogroup, the yearly note shown while yearly is active.
//
// Accessible: a labelled radiogroup of two buttons, the active one marked. Semantic DAWN tokens only
// (no hex). Voice: plain labels, no em dashes.

import { createContext, useContext, useState } from 'react'

export type BillingIntervalUI = 'month' | 'year'

const IntervalContext = createContext<{
  interval: BillingIntervalUI
  setInterval: (next: BillingIntervalUI) => void
} | null>(null)

/**
 * Wrap everything whose figures flip (the plan bands) in the interval scope. The wrapper carries
 * `data-interval`; the page's CSS shows the matching `[data-interval-show]` spans. Server Components
 * pass through as children untouched.
 */
export function PricingIntervalScope({ children }: { children: React.ReactNode }) {
  const [interval, setInterval] = useState<BillingIntervalUI>('month')
  return (
    <IntervalContext.Provider value={{ interval, setInterval }}>
      <div data-interval={interval}>{children}</div>
    </IntervalContext.Provider>
  )
}

/**
 * The pill control. Must render inside a `PricingIntervalScope`; outside one there is no state to
 * flip, so it renders nothing rather than a dead control.
 */
export function PricingBillingToggle({
  yearlyNote = 'Yearly is two months free.',
}: {
  yearlyNote?: string
}) {
  const ctx = useContext(IntervalContext)
  if (!ctx) return null
  const { interval, setInterval } = ctx

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
        <p className="mb-8 -mt-4 text-center text-body-sm font-semibold text-primary-strong">{yearlyNote}</p>
      )}
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
      className={`rounded-xl px-5 py-2 text-body-sm font-bold transition-colors ${
        active ? 'bg-primary text-on-primary lift-1' : 'text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  )
}

// ── The audience toggle (LIVE-759) ────────────────────────────────────────────────────────────────
// The five-tier ladder (ADR-1709) has two lines: the personal line (Member, Crew) and the Space line
// (Space, Business, Collective). A business reader should not have to read past the personal cards to
// reach the Space ones, so the page shows one line at a time, Space first. Same wiring as the interval
// toggle: the page renders BOTH lines statically (so crawlers and the FAQ schema see everything), the
// scope stamps `data-audience`, and CSS in the page hides the other line's `[data-audience-show]`.

export type PricingAudience = 'space' | 'personal'

const AudienceContext = createContext<{
  audience: PricingAudience
  setAudience: (next: PricingAudience) => void
} | null>(null)

/** Wrap everything that differs by audience (the plan cards, the comparison). Defaults to Space. */
export function PricingAudienceScope({ children }: { children: React.ReactNode }) {
  const [audience, setAudience] = useState<PricingAudience>('space')
  return (
    <AudienceContext.Provider value={{ audience, setAudience }}>
      <div data-audience={audience}>{children}</div>
    </AudienceContext.Provider>
  )
}

/** The "For your Space / For you" pill. Renders nothing outside a scope. */
export function PricingAudienceToggle() {
  const ctx = useContext(AudienceContext)
  if (!ctx) return null
  const { audience, setAudience } = ctx
  return (
    <div
      role="radiogroup"
      aria-label="Who the plans are for"
      className="mx-auto mb-4 flex w-fit items-center gap-1 rounded-2xl border border-border bg-surface p-1"
    >
      <IntervalButton active={audience === 'space'} onClick={() => setAudience('space')} label="For your Space" />
      <IntervalButton active={audience === 'personal'} onClick={() => setAudience('personal')} label="For you" />
    </div>
  )
}
