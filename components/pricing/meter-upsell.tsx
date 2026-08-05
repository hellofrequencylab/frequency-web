import Link from 'next/link'
import { Gauge } from 'lucide-react'
import { getPricingValues } from '@/lib/pricing/settings'
import {
  buildMeterUpsell,
  METER_UPSELL_CTA,
  meterUpsellSurface,
} from '@/lib/pricing/meter-upsell'

// METER UPSELL — THE in-context upsell surface for a metered feature (docs/VALUE-LADDER.md Phase 4).
//
// ONE IDIOM, ON PURPOSE. The repo already carries three gating idioms (CrewGate, UpsellTease,
// TeaserGate) plus four bespoke localStorage nudges, and that proliferation is the problem this
// component exists to stop being made worse. So this adds no new mechanism: it is a thin server seam
// over the SAME primitives every other meter surface uses. `nearAllowanceLimit` decides when (80%,
// the shared goal-gradient threshold), `feature-meters.ts` supplies the allowances, and
// `lib/pricing/meter-upsell.ts` writes the sentences. Nothing here invents a number or a rule.
//
// IT NEVER BLOCKS AND NEVER CHARGES. This is display + navigation only: no server action, no
// mutation, no checkout. The CTA is a plain Link to the billing / upgrade surface. A member over an
// allowance keeps every row they have; `withinAllowance` is the enforcement seam, and it is not here.
//
// RENDERS NOTHING unless the member is genuinely at 80% of a real allowance with a real higher rung
// above them. An unknown key, an unlimited rung, a zero allowance, or a member already at the top of
// the ladder all resolve to null, so a caller can drop it on any surface and it is a no-op when there
// is nothing honest to say.
//
// Server Component (PAGE-FRAMEWORK §5): the one await is the operator rate table, which is cached
// upstream. Semantic DAWN tokens only, no hardcoded hex. Voice per CONTENT-VOICE §10: plain
// sentences, concrete numbers, no narrated feelings, no urgency, no em dashes.

export async function MeterUpsell({
  featureKey,
  currentTier,
  usage,
  upgradeHref,
  className,
}: {
  /** The pricing feature key (a PLACEHOLDER_METER_LIMITS row, e.g. 'space_qr', 'journey_publish'). */
  featureKey: string
  /** The viewer's current tier on the meter's axis (the Space plan, or the membership tier). */
  currentTier: string | null | undefined
  /** The viewer's REAL usage on the meter's dimension. Required: the whole point is naming what they
   *  already built, and a guessed number would be worse than no prompt at all. */
  usage: number
  /** Where the CTA links (the billing / upgrade surface). Never a checkout. */
  upgradeHref: string
  /** Optional layout class for the caller's spacing rhythm. */
  className?: string
}) {
  const { take_rate } = await getPricingValues()
  const copy = buildMeterUpsell({
    featureKey,
    currentTier: currentTier ?? 'free',
    usage,
    rates: take_rate,
  })
  if (!copy) return null

  // The registry row is the surface's own documentation (and what the Phase 4 guard test asserts). It
  // is read here so a mount that was never registered is visible in the tree rather than silent.
  const surface = meterUpsellSurface(featureKey)

  return (
    <section
      className={`rounded-2xl border border-border bg-surface p-4 lift-1 ${className ?? ''}`}
      aria-label={`${copy.dimension} allowance`}
      data-meter-upsell={featureKey}
      data-meter-surface={surface?.kind ?? 'unregistered'}
    >
      <p className="flex items-center gap-1.5 text-meta font-semibold uppercase tracking-widest text-subtle">
        <Gauge className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {copy.dimension}
      </p>
      {/* WHAT YOU HAVE, then WHAT CHANGES. Never a sentence about what is missing. */}
      <p className="mt-1.5 text-body-sm font-semibold text-text">{copy.have}</p>
      <p className="mt-1 text-body-sm text-muted">{copy.change}</p>
      {/* The standing promise, stated in the affirmative: nothing is ever taken away at a limit. */}
      <p className="mt-1 text-2xs leading-relaxed text-muted">{copy.promise}</p>
      <Link
        href={upgradeHref}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        {METER_UPSELL_CTA}
      </Link>
    </section>
  )
}
