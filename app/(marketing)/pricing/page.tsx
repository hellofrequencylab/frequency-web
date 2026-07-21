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
import { PricingComparison } from '@/components/marketing/pricing-comparison'
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

// The flat pricing model (ADR-590): Business $49/mo, Nonprofit $29/mo flat, the Resonance Engine add-on
// +$20/mo, a flat 3% plus card processing, never per seat. One price, five doors.
export const metadata: Metadata = {
  title: 'Pricing for Spaces',
  description:
    'One honest price. Business is $49 a month, the Nonprofit plan is $29 a month flat, and the Resonance Engine add-on is $20 a month, optional on any paid plan. Our fee is a flat 3% plus card processing, never per seat. Monthly or yearly, two months free.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Frequency pricing: one honest price, never per seat',
    description:
      'Business $49 a month, the Nonprofit plan $29 a month flat, and the Resonance Engine add-on $20 a month. A flat 3% plus card processing, shown in full, with no surprise fees. Monthly or yearly, two months free.',
    url: '/pricing',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Frequency pricing: one honest price, never per seat',
    description:
      'Business $49, the Nonprofit plan $29 flat, the Resonance Engine add-on $20. A flat 3% plus card processing, no surprise fees. Two months free on yearly.',
  },
}

// The answer-first FAQ, mirrored into the FAQPage schema so the structured data matches the page.
const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: 'How does Frequency pricing work?',
    a: 'One price, presented by who you are. Business is $49 a month with the full depth: a branded Space site and custom domain, QR Studio, bookings, tickets, enrollment, check-in, donations, memberships, the full CRM, marketing automation, team roles, and analytics. The Nonprofit plan is $29 a month flat, everything in Business with donations built in, for verified 501(c)(3) organizations. The Resonance Engine add-on is $20 a month, optional on any paid plan. Flat, never per seat.',
  },
  {
    q: 'What is the Resonance Engine?',
    a: "The Resonance Engine turns your community's signals into live matches and next-best actions. It is an optional $20 a month add-on on any paid plan, has a 14-day trial, and you can turn it on or off anytime.",
  },
  {
    q: 'What are the fees?',
    a: 'Our fee is a flat 3% plus card processing, shown in full, with no surprise fees ever. That is 3% on what you sell, and 3% on what a nonprofit raises. There are no per-seat charges, on any plan.',
  },
  {
    q: 'What does yearly billing save?',
    a: 'Yearly billing is two months free: you pay for ten months and get twelve. Monthly is the low-friction default; yearly is the way to save on either plan.',
  },
  {
    q: 'Can I leave and take my people with me?',
    a: 'Yes. Your people are yours. You can export your contacts and your data any time. We earn your stay, we do not trap it.',
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
            One honest price.
            <br className="hidden sm:block" /> Five doors.
          </>
        }
        subtitle="Run your business on Frequency. Business is $49 a month, the Nonprofit plan is $29 a month flat, and the Resonance Engine add-on is $20 a month. A flat 3% plus card processing, never per seat. Monthly or yearly, two months free."
      >
        <Button href="/spaces">
          Start a Space <ArrowRight className="h-5 w-5" />
        </Button>
      </PhotoHero>

      {/* Mission framing, stated plainly. */}
      <Section tone="canvas" pad="pt-14 pb-10 sm:pt-16 sm:pb-12">
        <p className="text-center text-lg leading-relaxed text-muted sm:text-xl">{MISSION_FRAMING}</p>
      </Section>

      {/* The pricing table: Business + Nonprofit, with the monthly/yearly toggle island. */}
      <Section tone="surface" pad="pt-6 pb-20 sm:pb-24">
        <div className="mb-10 text-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-primary-strong">
            Two plans
          </p>
          <h2 className="font-display uppercase text-text text-4xl sm:text-5xl">
            Pick the plan that fits.
          </h2>
        </div>

        <PricingBillingToggle>
          <PricingTable tiers={tiers} />
        </PricingBillingToggle>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-subtle">
          Flat, never per seat. Yearly is two months free, and you can turn the Resonance Engine on or off
          anytime, with a 14-day trial.
        </p>
      </Section>

      {/* The value comparison: every Business feature vs the separate tool it replaces, totaled against the
          one flat price. Reads the pure lib/pricing/comparison catalog. */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="What it replaces"
          title="One price. The whole toolbox."
          kicker="Every tool a growing business stitches together, and what each one costs on its own. On Frequency it is one login, one bill, one flat price."
        />
        <PricingComparison />
      </Section>

      {/* The three promises that make it a movement, not a SaaS (ADR-590). */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="Three promises"
          title="Why people stay."
          kicker="The parts of the deal we will not move on."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              title: 'One honest price.',
              body: 'Our 3% plus card processing, shown in full, with no surprise fees ever. You always know exactly what a sale costs.',
            },
            {
              title: 'Your people are yours.',
              body: 'Export your contacts and your data any time. We earn your stay, we do not trap it.',
            },
            {
              title: 'Bring your community in.',
              body: 'The card scan and the referral loop turn every real-world introduction into a new person in Frequency, so aligned people lend each other their audiences.',
            },
          ].map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display uppercase text-text text-xl">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* "By who you are": each Mode -> its recommended loadout + monthly total, linking to its page. */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="By who you are"
          title="One system, five doors."
          kicker="The same Frequency, presented by who you are: Business, Business plus the Resonance Engine, or the flat Nonprofit plan."
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
              {row.breakdownLabel && (
                <p className="mt-1 text-right text-xs font-semibold text-subtle">{row.breakdownLabel}</p>
              )}
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
        body="One honest price, never per seat. Turn the Resonance Engine on when you want live matches, and your people are always yours to export."
      />
    </>
  )
}

// ── The pricing table ─────────────────────────────────────────────────────────
// One header row of plan columns (Business + Nonprofit), then a labelled row per dimension (price,
// billing, for, core, the Resonance Engine add-on, take-rate, CTA). Each price cell renders BOTH intervals
// (month + year), each wrapped in a span the toggle CSS shows/hides. Semantic DAWN tokens only (ADR-590).

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
