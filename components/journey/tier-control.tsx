'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { setMyJourneyTierAction } from '@/app/(main)/journeys/[slug]/actions'
import { isError } from '@/lib/action-result'
import { TIER_META, TIER_ORDER } from '@/components/journey/tier-meta'
import { cn } from '@/lib/utils'
import type { IntensityTier } from '@/lib/journey-tiers'

// Member intensity-tier control (docs/JOURNEYS.md §5). The member overrides the resolved
// depth for THIS journey — member override → circle default → item default → 'adept'.
// Tier changes only what they practise (never Zap/streak math). "Use default" clears the
// override (null) so it inherits the circle/item chain again. Self-only; the action re-gates.

export function TierControl({
  planId,
  slug,
  resolvedTier,
}: {
  planId: string
  slug: string
  /** The tier the member currently sees (after the resolution chain). */
  resolvedTier: IntensityTier
}) {
  const [selected, setSelected] = useState<IntensityTier>(resolvedTier)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function choose(tier: IntensityTier) {
    if (tier === selected || pending) return
    const prev = selected
    setSelected(tier)
    setErr(null)
    start(async () => {
      const res = await setMyJourneyTierAction(planId, slug, tier)
      if (isError(res)) {
        setSelected(prev)
        setErr(res.error)
      }
    })
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-text">Your intensity</h2>
        <span className="text-xs text-subtle">Same reward, your depth</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Intensity tier">
        {TIER_ORDER.map((tier) => {
          const meta = TIER_META[tier]
          const active = selected === tier
          return (
            <button
              key={tier}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => choose(tier)}
              title={meta.blurb}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-colors disabled:opacity-60',
                active
                  ? 'border-primary bg-primary-bg text-primary-strong'
                  : 'border-border bg-surface text-muted hover:border-border-strong hover:text-text',
              )}
            >
              <span className="text-lg leading-none" aria-hidden>
                {meta.glyph}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold">
                {active && <Check className="h-3 w-3" />}
                {meta.label}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-subtle" aria-live="polite">
        {err ?? TIER_META[selected].blurb}
      </p>
    </section>
  )
}
