// The /pricing plan cards (DAWN 2): the card, its price block, the rate line and the CTA. Split out of
// page.tsx so the page reads as its sections. Every string comes off the Offering.
import Link from 'next/link'
import { Button, PlanRibbon, planCardClasses } from '@/components/marketing/marketing-ui'
import { Reveal } from '@/components/marketing/motion'
import type { Offering } from '@/lib/pricing/pricing-grid'

// ── The plan cards (DAWN 2) ──────────────────────────────────────────────────
// One card per offering, in a light (cream band) and an ink (bg-slat band) dress. Every string comes
// off the Offering (which is built from the pricing config), so a card holds no pricing logic of its
// own. Semantic DAWN tokens only.
//
// KIT NOTE: the card SHELL and its ribbon are the kit's (`planCardClasses` / `PlanRibbon` in
// marketing-ui, shared with the Puck Tiers block). The card body stays here because it reads the live
// offering model. The one on-ink secondary CTA below is still page-local: the kit's `outlineInk` is a
// different hairline (on-ink/30, no fill), so adopting it would repaint the button.

/** One plan card. The featured card is the row's floating middle card (lift-2, primary border, the
 *  badge, wider via the grid's 1.2fr middle column and taller via the negative block margin, exactly
 *  the reference's silhouette). Non-featured cards rest on the page (lift-1) and center vertically.
 *
 *  `featured` READS the model (`Offering.featured`: one rung per ladder, the DAWN 2 reference's "Best
 *  choice" pair the owner adopted; see the flag's doc in lib/pricing/pricing-grid.ts), never a page
 *  prop — a prop here is how the page float and the comparison emphasis came to crown different
 *  plans. */
export function PlanCard({
  offering,
  tone = 'light',
}: {
  offering: Offering
  tone?: 'light' | 'ink'
}) {
  const ink = tone === 'ink'
  const featured = offering.featured
  return (
    <Reveal as="article" className={planCardClasses({ featured, ink })}>
      {featured && <PlanRibbon>Recommended</PlanRibbon>}
      <h3
        className={`font-display uppercase ${featured ? 'text-display-h3' : 'text-page-title'} ${
          ink ? 'text-on-ink' : 'text-text'
        }`}
      >
        {offering.label}
      </h3>
      <p className={`mt-1 text-body-sm font-semibold ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>
        {offering.tagline}
      </p>

      <PlanPrice offering={offering} ink={ink} featured={featured} />

      <p className={`mt-3 text-body-sm ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{offering.billing}</p>
      {offering.trial && (
        <p className={`mt-1 text-body-sm font-semibold ${ink ? 'text-on-ink' : 'text-text'}`}>
          {offering.trial}
        </p>
      )}
      <p className={`mt-3 flex-1 text-body-sm leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>
        {offering.forWho}
      </p>

      <RateLine takeRate={offering.takeRate} ink={ink} />

      <PlanCta offering={offering} ink={ink} featured={featured} />
    </Reveal>
  )
}

/** The rate line, which is the PAGE'S LEAD PROMISE and used to read as the quietest thing on the card
 *  (`text-body-sm text-subtle`, last, undifferentiated). It now sits on its own ruled strip, with the half
 *  that never changes carrying the weight and the network half staying quiet beside it.
 *
 *  The split is the same one the metadata and the FAQ already do (`takeRate.split(', ')`) — the string
 *  is built as "<your own>, <the network's>" — and it falls back to the whole line if a rate ever
 *  arrives without the comma, so a config change can soften the design but never lose the sentence. */
function RateLine({ takeRate, ink = false }: { takeRate: string; ink?: boolean }) {
  const [own, ...rest] = takeRate.split(', ')
  const network = rest.join(', ')
  return (
    <p
      className={`mt-4 border-t pt-3 text-body-sm leading-relaxed ${
        ink ? 'border-on-ink/10' : 'border-border'
      }`}
    >
      <span className={`font-semibold ${ink ? 'text-on-ink' : 'text-text'}`}>{own}</span>
      {network && <span className={ink ? 'text-on-ink-subtle' : 'text-subtle'}>, {network}</span>}
    </p>
  )
}

/** The headline price in the reference's card grammar, at BOTH intervals: the struck LIST anchor with
 *  its "Beta price" tag where the config carries one (the anchor is a monthly figure, so it rides the
 *  monthly span), the headline figure, and the honest beta lock line only under a real anchor. Both
 *  interval spans render statically and the billing toggle's CSS shows one — the pre-rebuild wiring,
 *  in the rebuilt card. A free tier has no yearly price, so its yearly span repeats the same label
 *  rather than going blank. Every figure reads off the offering. */
export function PlanPrice({
  offering,
  ink = false,
  featured = false,
}: {
  offering: Offering
  ink?: boolean
  featured?: boolean
}) {
  const intervals: { key: 'month' | 'year'; label: string; anchor: string | null }[] = [
    { key: 'month', label: offering.monthly, anchor: offering.listAnchor },
    { key: 'year', label: offering.yearly ?? offering.monthly, anchor: null },
  ]
  // A long price label (pay-what-you-want Crew reads "from $4.99/mo") steps down a size so the display
  // face never wraps mid-figure; the reference sizes by string length the same way.
  //
  // THIS FUNCTION STAYS (ADR-947). It is not four stray literals — it is a length-driven FITTING
  // algorithm, and collapsing it to one role would let a long figure wrap mid-price. What the roles
  // can do is name three of its four outputs, at exactly the sizes it already picked:
  // `stat-sm` IS 1.875rem with text-3xl's ratio and `stat-md` IS 2.25rem with text-4xl's, so these
  // swaps are byte-identical renders that additionally put the price back on the --type-scale axis.
  // The featured/short branch keeps its literals: it runs 3rem → 3.75rem, and the ladder has no rung
  // between `stat-md` (2.25rem) and the hero `stat` (3.5rem floor, and fluid). The new
  // `page-title-lg` does not reach it either — it CEILINGS at 2.25rem, i.e. where this branch starts.
  // Inventing a role for one call site is the thing ADR-947 declined to do; that has not changed.
  const sizeFor = (label: string) => {
    const long = label.length > 8
    return featured
      ? long
        ? 'text-stat-sm sm:text-stat-md'
        : 'text-5xl sm:text-6xl'
      : long
        ? 'text-stat-sm'
        : 'text-stat-md'
  }
  return (
    <div className="mt-4">
      {intervals.map(({ key, label, anchor }) => (
        <span key={key} data-interval-show={key}>
          {anchor && (
            <span className="flex items-baseline gap-2">
              <span className={`text-body-sm line-through ${ink ? 'text-on-ink-subtle' : 'text-subtle'}`}>
                {anchor}/mo
              </span>
              <span
                className={`text-3xs font-black uppercase tracking-eyebrow ${
                  ink ? 'text-primary' : 'text-primary-strong'
                }`}
              >
                Beta price
              </span>
            </span>
          )}
          <span
            className={`mt-1 block font-display leading-none ${sizeFor(label)} ${
              ink ? 'text-on-ink' : 'text-text'
            }`}
          >
            {label}
          </span>
        </span>
      ))}
      {offering.betaNote && (
        <span
          className={`mt-2 block text-meta font-semibold ${
            ink ? 'text-primary' : 'text-primary-strong'
          }`}
        >
          {offering.betaNote}
        </span>
      )}
    </div>
  )
}

/** The card CTA. The kit `Button` covers the primary (featured) and light-secondary cases; an on-ink
 *  secondary does not exist in the kit yet, so that one case carries the same shape page-locally
 *  (see the KIT NOTE above). */
export function PlanCta({
  offering,
  ink,
  featured,
}: {
  offering: Offering
  ink: boolean
  featured: boolean
}) {
  if (featured || !ink) {
    return (
      <Button
        href={offering.cta.href}
        variant={featured ? 'primary' : 'secondary'}
        className="mt-5 w-full"
      >
        {offering.cta.label}
      </Button>
    )
  }
  return (
    <Link
      href={offering.cta.href}
      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-card border border-on-ink/20 bg-on-ink/10 px-8 py-3.5 text-body font-bold text-on-ink transition-colors hover:bg-on-ink/15"
    >
      {offering.cta.label}
    </Link>
  )
}
