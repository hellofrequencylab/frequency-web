import type { Metadata } from 'next'
import { ArrowRight, Check } from 'lucide-react'
import {
  PhotoHero,
  Section,
  SectionHeading,
  Statement,
  BetaCTA,
  FaqList,
  Button,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, faqSchema, productSchema } from '@/lib/jsonld'
import { PricingBillingToggle } from '@/components/marketing/pricing-billing-toggle'
import {
  pricingTiers,
  tierHeadline,
  tierListAnchor,
  loadoutStrip,
  PRICING_ADDONS,
  MISSION_FRAMING,
  CREW_NOTE,
  type PricingTier,
} from '@/lib/pricing/pricing-page'
import type { BillingInterval } from '@/lib/billing/pricing-keys'

// FAST: the commercial pricing page is STATIC (revalidate is a courtesy for the rare catalog-config
// edit; the page itself reads only the CODE catalog defaults via lib/pricing/pricing-page, so there are
// ZERO per-request DB billing reads). The monthly/yearly toggle is the only client island; both
// intervals are rendered at build time and the toggle flips which is shown.
export const revalidate = 3600

// TODO(ADR-472 surfaces): rebuild this page as the four-tier ladder (Pro/Business/Nonprofit/Organization)
// with the Business base. This pass keeps it compiling and truthful: Pro is the solo base, the higher
// tiers carry the full depth, and the AI Engine is the only metered add-on.
export const metadata: Metadata = {
  title: 'Pricing for Spaces',
  description:
    'Frequency Spaces run on a tier that fits, from the Pro base up. Pro is $19 a month at the founding price, with Business, Nonprofit, and Organization tiers. The AI Engine add-on is metered on any paid tier. List anchor over a founding price, monthly or yearly.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Frequency pricing: a tier that fits, plus the AI Engine',
    description:
      'A tier ladder from the Pro base up: Business adds marketing automation, team roles, and your own domain, with Nonprofit and Organization tiers. The AI Engine is the only metered add-on. Founding price under a list anchor, monthly or yearly.',
    url: '/pricing',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Frequency pricing: a tier that fits, plus the AI Engine',
    description:
      'A tier ladder from the Pro base up, with the AI Engine as the only metered add-on. Founding price under a list anchor, monthly or yearly.',
  },
}

// The answer-first FAQ, mirrored into the FAQPage schema so the structured data matches the page.
const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: 'How does Frequency pricing work?',
    a: 'Every Space starts on the Pro base at $19 a month, the founding price, under a $29 list anchor. Pro is the solo tier with the CRM core. Business is the full-depth tier, adding marketing automation, full CRM, team roles, and your own domain, with multi-seat. Nonprofit carries the same full depth, discounted and per licensed seat, and Organization adds custom, white-label, and governance. The AI Engine is the only metered add-on, available on any paid tier for $20 a month.',
  },
  {
    q: 'What is the founding price?',
    a: 'The founding price is the real price today. The list price sits above it as an anchor, so you can see where the price is headed. If you subscribe at the founding price, you keep it for as long as the subscription stays active, even after the list price rises.',
  },
  {
    q: 'What does yearly billing save?',
    a: 'Yearly billing is two months free: you pay for ten months and get twelve. Monthly is the low-friction default; yearly is the way to lock your founding price for a full year.',
  },
  {
    q: 'What is the take-rate?',
    a: 'Pro is 5% on what you sell, Nonprofit is 3% on what you raise, and Organization is custom. The take-rate is the only fee on transactions; there is no separate per-transaction charge from Frequency on top of it.',
  },
  {
    q: 'Is there a personal plan?',
    a: 'Yes. Crew is the personal tier for individuals, at $9 a month under a $12 list price. It lives on the personal upgrade page, not on this commercial page.',
  },
  {
    q: 'Where does the money go?',
    a: MISSION_FRAMING,
  },
]

export default function PricingPage() {
  const tiers = pricingTiers()
  const strip = loadoutStrip()

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([{ name: 'Pricing', path: '/pricing' }]),
          faqSchema(PRICING_FAQ),
          // One Product/Offer per commercial tier, priced at the monthly founding amount (the real
          // price today). Built from the same catalog the table renders, so the schema never drifts.
          ...tiers.map((t) =>
            productSchema({
              title: `Frequency ${t.name}`,
              description: t.forWho,
              priceCents: t.price.month.foundingCents,
              currency: 'usd',
              path: '/pricing',
              sellerName: 'Frequency',
            }),
          ),
        ]}
      />

      {/* The CSS that drives the monthly/yearly toggle island: hide the interval the wrapper is not on.
          The wrapper carries data-interval; each price span carries data-interval-show. No client JS in
          the page itself; the toggle (a client island) only flips the wrapper attribute. */}
      <style>{`
        [data-interval='month'] [data-interval-show='year'] { display: none; }
        [data-interval='year'] [data-interval-show='month'] { display: none; }
      `}</style>

      <PhotoHero
        image="/images/site/lab-lounge.jpg"
        alt="The connection bar inside The Lab, warm and low-lit"
        focal="object-center"
        eyebrow="Pricing for Spaces"
        title={
          <>
            A tier that fits.
            <br className="hidden sm:block" /> One AI add-on.
          </>
        }
        subtitle="Run your business on Frequency. Start on the Pro base and move up to the full-depth Business tier as you grow. The AI Engine is the only metered add-on. Founding price under a list anchor, monthly or yearly."
      >
        <Button href="/spaces">
          Start a Space <ArrowRight className="h-5 w-5" />
        </Button>
      </PhotoHero>

      {/* Mission framing, stated plainly. */}
      <Section tone="canvas" pad="pt-14 pb-10 sm:pt-16 sm:pb-12">
        <p className="text-center text-lg leading-relaxed text-muted sm:text-xl">{MISSION_FRAMING}</p>
      </Section>

      {/* The pricing table: Pro / Nonprofit / Organization, with the monthly/yearly toggle island. */}
      <Section tone="surface" pad="pt-6 pb-20 sm:pb-24">
        <div className="mb-10 text-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-primary-strong">
            Three tiers
          </p>
          <h2 className="font-display uppercase text-text text-4xl sm:text-5xl">
            Pick the tier that fits.
          </h2>
        </div>

        <PricingBillingToggle>
          <PricingTable tiers={tiers} />
        </PricingBillingToggle>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-subtle">
          The list price is the anchor; the founding price beneath it is what you pay today. Subscribe at
          the founding price and you keep it for as long as the subscription stays active.
        </p>
      </Section>

      {/* "By who you are": each Mode -> its recommended loadout + monthly total, linking to its page. */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="By who you are"
          title="A loadout for how you work."
          kicker="The Pro base, with the AI Engine add-on where it fits your operating model, and the monthly total."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {strip.map((row) => (
            <a
              key={row.id}
              href={row.href}
              className="group flex flex-col rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display uppercase text-text text-2xl">{row.label}</h3>
                <span className="font-display text-2xl text-primary-strong">{row.totalLabel}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{row.note}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary-strong">
                See the details
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </a>
          ))}
        </div>
      </Section>

      {/* Crew, the personal tier, noted plainly with a link to the upgrade page. */}
      <Section tone="surface" pad="py-12 sm:py-16">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-2xl border border-border bg-surface-elevated/60 px-6 py-8 text-center">
          <h3 className="font-display uppercase text-text text-2xl">{CREW_NOTE.name}</h3>
          <p className="text-base leading-relaxed text-muted">{CREW_NOTE.line}</p>
          <Button href={CREW_NOTE.href} variant="secondary">
            See Crew
          </Button>
        </div>
      </Section>

      <Statement tone="canvas">
        You pay for the parts of the business{' '}
        <span className="text-primary">you actually run.</span>
      </Statement>

      {/* Earned, not bought: roles never come from a checkout. */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="A note on status"
          title="Host, Guide, and Mentor are earned, not bought."
          kicker="You cannot buy your way to the front of the room."
        />
        <p className="text-lg leading-relaxed text-muted">
          A plan is how you run a Space. Leadership in the community is something you grow into. Host,
          Guide, and Mentor come from showing up and looking after the people around you, never from a
          checkout page.
        </p>
      </Section>

      <Section tone="canvas">
        <SectionHeading eyebrow="Straight answers" title="Questions, answered plainly." />
        <FaqList items={PRICING_FAQ} />
      </Section>

      <BetaCTA
        heading="Run your Space on Frequency."
        body="Start on the Pro base, move up to Business for the full depth, and turn on the AI Engine when you need it. Founding price locked for as long as you stay subscribed."
      />
    </>
  )
}

// ── The pricing table ─────────────────────────────────────────────────────────
// One header row of tier columns, then a labelled row per dimension (price, billing, for, core, the AI
// Engine add-on, take-rate, CTA). Each price cell renders BOTH intervals (month + year), each wrapped in
// a span the toggle CSS shows/hides. Semantic DAWN tokens only.
// TODO(ADR-472 surfaces): rebuild as the four-tier table (Pro/Business/Nonprofit/Organization).

function PricingTable({ tiers }: { tiers: PricingTier[] }) {
  return (
    <>
      {/* Mobile: stacked cards (a table is unreadable narrow). */}
      <div className="grid gap-6 lg:hidden">
        {tiers.map((t) => (
          <TierCard key={t.id} tier={t} />
        ))}
      </div>

      {/* Desktop: the real table. */}
      <div className="hidden overflow-hidden rounded-2xl border border-border lg:block">
        <table className="w-full text-left">
          <caption className="sr-only">Frequency Space pricing by tier</caption>
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th scope="col" className="px-5 py-4" />
              {tiers.map((t) => (
                <th
                  key={t.id}
                  scope="col"
                  className={`px-5 py-4 align-bottom ${t.featured ? 'bg-primary-bg/30' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-display uppercase text-text text-2xl">{t.name}</span>
                    {t.featured && (
                      <span className="rounded-md bg-primary px-2 py-0.5 text-3xs font-black uppercase tracking-wider text-on-primary">
                        Most chosen
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-sm">
            <Row label="Price" tiers={tiers}>{(t) => <PriceCell tier={t} />}</Row>
            <Row label="Billing" tiers={tiers}>{(t) => <span className="text-muted">{t.billing}</span>}</Row>
            <Row label="For" tiers={tiers}>{(t) => <span className="text-muted">{t.forWho}</span>}</Row>
            <Row label="Core included" tiers={tiers}>
              {(t) => <span className="text-muted">{t.coreIncluded}</span>}
            </Row>
            {PRICING_ADDONS.map((a) => (
              <Row key={a.key} label={`${a.glyph} ${a.label}`} tiers={tiers}>
                {(t) => <AddonCell tier={t} addon={a.key} />}
              </Row>
            ))}
            <Row label="Take-rate" tiers={tiers}>
              {(t) => <span className="font-semibold text-text">{t.takeRate}</span>}
            </Row>
            <Row label="" tiers={tiers}>
              {(t) => (
                <Button href={t.cta.href} variant={t.featured ? 'primary' : 'secondary'} size="sm">
                  {t.cta.label}
                </Button>
              )}
            </Row>
          </tbody>
        </table>
      </div>
    </>
  )
}

function Row({
  label,
  tiers,
  children,
}: {
  label: string
  tiers: PricingTier[]
  children: (tier: PricingTier) => React.ReactNode
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <th scope="row" className="px-5 py-4 align-top font-semibold text-text">
        {label}
      </th>
      {tiers.map((t) => (
        <td key={t.id} className={`px-5 py-4 align-top ${t.featured ? 'bg-primary-bg/15' : ''}`}>
          {children(t)}
        </td>
      ))}
    </tr>
  )
}

function PriceCell({ tier }: { tier: PricingTier }) {
  return (
    <div>
      {(['month', 'year'] as BillingInterval[]).map((interval) => {
        const anchor = tierListAnchor(tier, interval)
        return (
          <span key={interval} data-interval-show={interval} className="flex items-baseline gap-2">
            {anchor && <span className="text-base text-subtle line-through">{anchor}</span>}
            <span className="font-display text-text text-2xl leading-none">
              {tierHeadline(tier, interval)}
            </span>
          </span>
        )
      })}
      {tier.priceKind === 'flat' && (
        <span className="mt-1 block text-xs text-primary-strong">Founding price</span>
      )}
    </div>
  )
}

function AddonCell({ tier, addon }: { tier: PricingTier; addon: string }) {
  const cell = tier.addons.find((a) => a.addon === addon)
  if (!cell) return null
  const included = cell.value === 'Included'
  return (
    <span className={`inline-flex items-center gap-1.5 ${included ? 'text-success' : 'text-text'}`}>
      {included && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      {cell.value}
    </span>
  )
}

// The mobile stacked card for one tier (the table is desktop-only).
function TierCard({ tier }: { tier: PricingTier }) {
  return (
    <div
      className={`rounded-2xl border bg-surface p-6 ${
        tier.featured ? 'border-2 border-primary ring-4 ring-primary-bg' : 'border-border'
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-display uppercase text-text text-2xl">{tier.name}</h3>
        {tier.featured && (
          <span className="rounded-md bg-primary px-2 py-0.5 text-3xs font-black uppercase tracking-wider text-on-primary">
            Most chosen
          </span>
        )}
      </div>
      <div className="mb-4">
        <PriceCell tier={tier} />
        <p className="mt-1 text-sm text-muted">{tier.billing}</p>
      </div>
      <p className="mb-2 text-sm text-muted">{tier.forWho}</p>
      <p className="mb-4 text-sm text-muted">{tier.coreIncluded}</p>
      <ul className="mb-4 space-y-2 text-sm">
        {PRICING_ADDONS.map((a) => (
          <li key={a.key} className="flex items-center justify-between gap-3">
            <span className="text-text">
              {a.glyph} {a.label}
            </span>
            <AddonCell tier={tier} addon={a.key} />
          </li>
        ))}
      </ul>
      <p className="mb-4 text-sm font-semibold text-text">Take-rate: {tier.takeRate}</p>
      <Button href={tier.cta.href} variant={tier.featured ? 'primary' : 'secondary'} className="w-full">
        {tier.cta.label}
      </Button>
    </div>
  )
}
