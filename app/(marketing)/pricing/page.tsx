import type { Metadata } from 'next'
import { ArrowRight, Check, Minus } from 'lucide-react'
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
import { Illustration } from '@/components/marketing/illustrations'
import { breadcrumbSchema, faqSchema, productSchema } from '@/lib/jsonld'
import { PricingBillingToggle } from '@/components/marketing/pricing-billing-toggle'
import { PricingComparison } from '@/components/marketing/pricing-comparison'
import { getPricingValues } from '@/lib/pricing/settings'
import { catalogConfigByKey, loadCatalogConfig } from '@/lib/pricing/catalog-config'
import { isBetaPricingActive } from '@/lib/pricing/beta'
import { loadFeatureGateOverrides } from '@/lib/pricing/gates'
import { annualDiscountNote, trialNote } from '@/lib/pricing/display'
import {
  memberFeatureGrid,
  memberOfferings,
  planExtras,
  spaceFeatureGrid,
  spaceOfferings,
  type FeatureGrid,
  type GridCell,
  type Offering,
  type PlanExtra,
  type PricingGridInput,
} from '@/lib/pricing/pricing-grid'
import { MISSION_FRAMING, PLAN_STORY } from '@/lib/pricing/pricing-page'

// EVERY figure on this page is READ, never written. Prices, the yearly deal, the trial length, the
// per-tier take-rate, the add-on and seat amounts, and every cell of the comparison grid come from
// lib/pricing/pricing-grid.ts, which derives them from the operator-editable pricing config
// (pricing_settings, edited at /admin/pricing) and from the entitlement key sets the product actually
// gates on. So an operator changing a price changes this page with no deploy, and moving a capability
// between tiers moves it in the grid. There is no dollar figure, and no percentage, in this file.
//
// SPEED: the page is ISR (revalidate below). The two config reads are request-cached and happen once per
// revalidation, not per visitor. The monthly/yearly toggle is the only client island; both intervals are
// rendered and CSS flips which one shows.
export const revalidate = 3600

/** Resolve the whole pricing model from the operator-editable config. One place, so the metadata, the
 *  JSON-LD, the cards, and the grid can never quote different numbers.
 *
 *  Two resolutions ride along (ADR-880), because a page that resolves either one differently from the
 *  product is a page that lies:
 *   • `betaActive` is the SAME question the checkout asks (isBetaPricingActive()), so on the cutover
 *     instant this table, its JSON-LD Offers, the OG description, and the FAQ all move to the list
 *     price in step with what Stripe starts charging.
 *   • `gateOverrides` are the operator's live feature-gate rows, merged over the code map exactly the
 *     way featureAllowed merges them at enforcement time, so a gate an operator RAISED cannot leave
 *     this page promising a feature the product will refuse. */
async function pricingInput(): Promise<PricingGridInput> {
  const [values, catalog, gateOverrides] = await Promise.all([
    getPricingValues(),
    loadCatalogConfig(),
    loadFeatureGateOverrides(),
  ])
  return {
    values,
    catalog: catalogConfigByKey(catalog),
    betaActive: isBetaPricingActive(),
    gateOverrides,
  }
}

/** The plain "Business is X, Collective is Y" ladder sentence, built from the offerings. */
function ladderSentence(offerings: Offering[]): string {
  return offerings
    .filter((o) => o.monthlyCents > 0)
    .map((o) => `${o.label} is ${o.monthly}${o.listAnchor ? ` at the beta rate, under ${o.listAnchor}` : ''}`)
    .join(', ')
}

export async function generateMetadata(): Promise<Metadata> {
  const input = await pricingInput()
  const ladder = ladderSentence(spaceOfferings(input))
  const crew = memberOfferings(input)[1]!
  const description = `Connection is free on Frequency. Businesses pay for reach and scale, never for access to people. Start a Space free; paid plans raise the limits. ${ladder}. Crew, the personal tier, is ${crew.monthly}. ${annualDiscountNote(input.values)}`
  return {
    title: 'Pricing: every plan, side by side',
    description,
    alternates: { canonical: '/pricing' },
    openGraph: {
      title: 'Frequency pricing: connection is free, paid plans raise the limits',
      description,
      url: '/pricing',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Frequency pricing: connection is free, paid plans raise the limits',
      description,
    },
  }
}

/** The answer-first FAQ, built from the live model so no answer can quote a stale price. Mirrored into
 *  the FAQPage schema, so the structured data matches the page. */
function pricingFaq(input: PricingGridInput): { q: string; a: string }[] {
  const spaces = spaceOfferings(input)
  const [member, crew] = memberOfferings(input)
  const extras = planExtras(input)
  const ai = extras.find((e) => e.key === 'ai')!
  const seats = extras.find((e) => e.key === 'seats')!
  const ladder = spaces
    .map((s) => `${s.label} is ${s.monthly}${s.listAnchor ? ` at the beta rate, under ${s.listAnchor}` : ''}: ${s.tagline.toLowerCase()} ${s.forWho}`)
    .join(' ')
  const trial = trialNote(input.values)
  const rates = spaces.map((s) => `${s.label} ${s.takeRate.split(', ')[1]}`).join(', ')

  // The beta answer only exists while there IS a beta rate. Once the window closes every plan has one
  // price, the anchors are gone from the model, and an answer about "the rate you keep" would be
  // describing an offer nobody can take (ADR-880). The question drops out with the offer.
  const betaPlans = spaces.filter((s) => s.listAnchor)
  const betaFaq =
    betaPlans.length > 0
      ? [
          {
            q: 'What is the beta rate, and do I keep it?',
            a: `Two plans are sold at a beta rate below their list price: ${betaPlans
              .map((s) => `${s.label} at ${s.monthly} under ${s.listAnchor}`)
              .join(' and ')}. If you subscribe on that rate you keep it for as long as you keep the plan. The other plans have one price, and we do not cross out a number we never charged.`,
          },
        ]
      : []

  return [
    {
      q: 'How does Frequency pricing work?',
      a: `Connection is free; paid plans raise the limits. There are two ladders. Membership: ${member!.label} is free forever and covers the whole social side, including hosting your own events and taking RSVPs, and ${crew!.label} is ${crew!.monthly} for full access to member programs plus selling tickets and taking payments. Spaces: ${ladder} ${annualDiscountNote(input.values)}`,
    },
    {
      q: 'Can I run a Space for free?',
      a: `Yes, and anyone can. A free Space is a real Space, not a trial: your storefront, your page, events, posts, members, and a place for your people to gather. You do not need Crew to run one. No card, no clock. Upgrade when you want to reach more people at once.`,
    },
    {
      q: 'What stays free forever?',
      a: 'The people part. Joining Frequency, belonging to Circles, going to events, following Spaces, and messaging never cost anything, for members or for you. A business never pays for access to people; a paid plan buys reach and scale, higher limits on the same tools every Space already has.',
    },
    ...betaFaq,
    {
      q: 'Do you take a cut of my sales?',
      a: `Not of your own. You keep 100% of the bookings and sales you bring in yourself, always, and tips are never touched. We earn a share only of a sale the network introduced, a referral or a discovery inside the collective, and that rate drops as your plan rises: ${rates}. Selling as a person rather than a Space runs on ${crew!.label}, at ${crew!.takeRate.split(', ')[1]}. Once a buyer is yours, meaning they follow you, they are one of your members, they are in your contacts, or they have bought before, we take nothing on them again: we charge once for the introduction, and after that they are your people, free.`,
    },
    {
      q: 'How do team seats work?',
      a: `Your own seat is included on every plan. ${seats.availability} ${seats.detail} ${seats.price === 'Owner-priced today' ? 'Seats are owner-priced today, so you bring on the people you need without a locked public per-seat price.' : `Extra seats are ${seats.price}.`}`,
    },
    {
      q: 'What is the Vera AI add-on?',
      a: `${ai.detail} ${ai.availability} It is ${ai.price}${trial ? `, with a ${trial.toLowerCase().replace(/\.$/, '')}` : ''}.`,
    },
    {
      q: 'Is there a free trial?',
      a: trial
        ? `${trial} on every paid Space plan, card upfront, cancel before it ends and you are not billed. Members need no trial: the free tier is the trial, for as long as you want it.`
        : 'A free Space and a free membership are open-ended, so the free tier is the trial for as long as you want it.',
    },
    {
      q: 'What does yearly billing save?',
      a: `${annualDiscountNote(input.values)} You pay for ten months and get twelve. Monthly is the low-friction default; yearly is the way to save on any plan.`,
    },
    {
      q: 'What happens if I downgrade?',
      a: 'Nothing disappears. Your contacts, posts, events, and history stay visible and stay yours; you just go back to the free limits, so you cannot add past the caps until you upgrade again. You can export your contacts and your data before, during, or after, anytime.',
    },
    {
      q: 'Can I leave and take my people with me?',
      a: 'Yes. Month to month, and your people are yours. You can export your contacts and your data any time. We earn your stay, we do not trap it.',
    },
    {
      q: 'Where does the money go?',
      a: MISSION_FRAMING,
    },
  ]
}

export default async function PricingPage() {
  const input = await pricingInput()
  const members = memberOfferings(input)
  const spaces = spaceOfferings(input)
  const extras = planExtras(input)
  const faq = pricingFaq(input)
  const ladder = ladderSentence(spaces)

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([{ name: 'Pricing', path: '/pricing' }]),
          faqSchema(faq),
          // One Product/Offer per PAID offering, priced at the amount actually charged today (the beta
          // rate where there is one). A free tier is not an Offer (a zero-price Product reads as spam to
          // answer engines; the FAQ carries the free story instead). Built from the same model the page
          // renders, so the schema never drifts from the table.
          ...[...members, ...spaces]
            .filter((o) => o.monthlyCents > 0)
            .map((o) =>
              productSchema({
                title: `Frequency ${o.label}`,
                description: o.forWho,
                priceCents: o.monthlyCents,
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
        eyebrow="Every plan, side by side"
        title={
          <>
            Connection is free.
            <br className="hidden sm:block" /> Paid plans <span className="text-primary">raise the limits.</span>
          </>
        }
        subtitle={`Frequency is where your local community happens. Businesses pay for reach and scale, never for access to people. Being a member is free and running a Space is free. ${ladder}. You keep 100% of what you bring in yourself.`}
      >
        <Button href="/spaces">
          Start a Space <ArrowRight className="h-5 w-5" />
        </Button>
      </PhotoHero>

      {/* Mission framing, stated plainly, with the "we only earn when you do" infographic. */}
      <Section tone="canvas" pad="pt-14 pb-10 sm:pt-16 sm:pb-12">
        <div className="mx-auto mb-6 h-28 w-full max-w-xs">
          <Illustration name="earn-together" className="h-full" />
        </div>
        <p className="text-center text-lg leading-relaxed text-muted sm:text-xl">{MISSION_FRAMING}</p>
      </Section>

      {/* THE PLANS. Two ladders, seven plans, every one of them sellable: the personal membership
          (Member, Crew) and the Space plans (Free through Independent). One billing toggle governs both,
          so a reader compares monthly against monthly. */}
      <Section tone="surface" pad="pt-6 pb-16 sm:pb-20">
        <div className="mb-10 text-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-primary-strong">The plans</p>
          <h2 className="font-display uppercase text-text text-4xl sm:text-5xl">Pick the plan that fits.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Two ladders. One for you as a member, one for the Space you run. You can be on both, and you
            can start on the free rung of either.
          </p>
        </div>

        <PricingBillingToggle yearlyNote={annualDiscountNote(input.values)}>
          <div className="mb-12">
            <LadderHeading
              title="For you"
              kicker="Being a member is free, forever. Both rungs sell; Crew takes the rate down and lifts the caps."
            />
            <div className="grid gap-5 sm:grid-cols-2">
              {members.map((o) => (
                <OfferingCard key={o.id} offering={o} />
              ))}
            </div>
          </div>

          <div>
            <LadderHeading
              title="For your Space"
              kicker="A Space is free for anyone to start. The paid plans raise the limits and buy down the fee."
            />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {spaces.map((o) => (
                <OfferingCard key={o.id} offering={o} />
              ))}
            </div>
          </div>
        </PricingBillingToggle>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm leading-relaxed text-subtle">
          {PLAN_STORY.meters} And you keep 100% of your own bookings, always: the take-rate applies only
          to a sale the network introduced, and it drops as your plan rises. Once someone is yours, a
          follower, one of your members, a contact, or a past buyer, we take nothing on them again. We
          charge once for the introduction. After that they are your people, free.
        </p>
      </Section>

      {/* Seats + the AI add-on: the two things you can add to a plan, priced from the same config, and
          both also rows in the comparison below so the difference between tiers stays visible. */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="Add to any plan"
          title="Seats and AI, priced in the open."
          kicker="Two things ride on top of a plan instead of being one. Neither is a surprise line item, and both show up in the comparison below."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {extras.map((extra) => (
            <ExtraCard key={extra.key} extra={extra} />
          ))}
        </div>
      </Section>

      {/* THE COMPARISON. The centerpiece: what every tier actually gets, derived from the entitlement
          key sets, the feature gates, and the usage ladders, so it cannot drift from the product. */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="The full comparison"
          title="What each plan gets."
          kicker="Every row below is read from the same rules the product runs on, so this table says what your account will actually do."
        />

        <ComparisonBlock
          title="Membership"
          kicker="What you get as a person, on the free tier and on Crew."
          grid={memberFeatureGrid(input)}
          offerings={members}
          openId="crew"
        />

        <div className="mt-14">
          <ComparisonBlock
            title="Spaces"
            kicker="What a Space gets on each plan, from free to Independent."
            grid={spaceFeatureGrid(input)}
            offerings={spaces}
            openId="business"
          />
        </div>
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

      {/* The four brand promises that make it a collective, not a SaaS (ADR-811 §1a). */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="Four promises"
          title="Why people stay."
          kicker="The parts of the deal we will not move on."
        />
        <div className="mx-auto mb-8 h-28 w-full max-w-sm">
          <Illustration name="four-promises" className="h-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              title: 'We never take a cut of your bookings.',
              body: 'You keep 100% of the business you bring in yourself. We earn only on the business the network brings you.',
            },
            {
              title: 'One honest price, no surprise invoices.',
              body: 'Your plan is one flat monthly price, and a fee you always see in full. Any add-on you turn on, like Vera AI or extra operator seats, is shown up front, never a hidden line item.',
            },
            {
              title: 'Month to month. Leave anytime.',
              body: 'Your people are yours. Export your contacts and your data any time. We earn your stay, we do not trap it.',
            },
            {
              title: 'See exactly what the network earned you.',
              body: 'An honest receipt: the real dollars the collective sourced for you, and what our share of that was. Nothing hidden.',
            },
          ].map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display uppercase text-text text-xl">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          ))}
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
        <FaqList items={faq} />
      </Section>

      <BetaCTA
        heading="Run your Space on Frequency."
        body="Keep 100% of your own bookings, and let the collective bring you more. Month to month, your people always yours to export."
      />
    </>
  )
}

// ── The plan cards ───────────────────────────────────────────────────────────
// One card per offering. Every string comes off the Offering (which is built from the pricing config),
// so a card holds no pricing logic of its own. Semantic DAWN tokens only.

function LadderHeading({ title, kicker }: { title: string; kicker: string }) {
  return (
    <div className="mb-5">
      <h3 className="font-display uppercase text-text text-2xl">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{kicker}</p>
    </div>
  )
}

function OfferingCard({ offering }: { offering: Offering }) {
  return (
    <div
      className={`flex flex-col rounded-2xl border bg-surface p-6 ${
        offering.featured ? 'border-2 border-primary ring-4 ring-primary-bg' : 'border-border'
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="font-display uppercase text-text text-2xl">{offering.label}</h4>
        {offering.featured && (
          <span className="rounded-md bg-primary px-2 py-0.5 text-3xs font-black uppercase tracking-wider text-on-primary">
            Most chosen
          </span>
        )}
      </div>
      <p className="mb-4 text-sm font-semibold text-muted">{offering.tagline}</p>

      <PriceBlock offering={offering} />

      <p className="mt-3 text-sm text-muted">{offering.billing}</p>
      {offering.trial && <p className="mt-1 text-sm font-semibold text-text">{offering.trial}</p>}
      <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{offering.forWho}</p>
      <p className="mt-3 text-sm text-subtle">{offering.takeRate}</p>

      <Button
        href={offering.cta.href}
        variant={offering.featured ? 'primary' : 'secondary'}
        className="mt-5 w-full"
      >
        {offering.cta.label}
      </Button>
    </div>
  )
}

/** The headline price. Renders BOTH intervals (the toggle CSS shows one), with the crossed-out list
 *  anchor where the config carries one, and the beta lock line only beside a real anchor. */
function PriceBlock({ offering }: { offering: Offering }) {
  const intervals: { key: 'month' | 'year'; label: string | null }[] = [
    { key: 'month', label: offering.monthly },
    { key: 'year', label: offering.yearly ?? offering.monthly },
  ]
  return (
    <div>
      {intervals.map(({ key, label }) => (
        <span key={key} data-interval-show={key} className="flex items-baseline gap-2">
          {key === 'month' && offering.listAnchor && (
            <span className="text-base text-subtle line-through">{offering.listAnchor}</span>
          )}
          <span className="font-display text-text text-3xl leading-none">{label}</span>
        </span>
      ))}
      {offering.betaNote && (
        <span className="mt-2 block text-xs font-semibold text-primary-strong">{offering.betaNote}</span>
      )}
    </div>
  )
}

function ExtraCard({ extra }: { extra: PlanExtra }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display uppercase text-text text-2xl">{extra.label}</h3>
        <span className="font-display text-primary-strong text-xl">{extra.price}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{extra.detail}</p>
      <p className="mt-2 text-sm font-semibold text-text">{extra.availability}</p>
    </div>
  )
}

// ── The comparison grid ──────────────────────────────────────────────────────
// Two presentations of the same pure model, so it is readable at any width:
//   * MOBILE: one collapsible section per plan (native <details>, no client JS), each listing every
//     group and row for that plan. A squashed multi-column table is unreadable on a phone.
//   * DESKTOP: the real table, scrolling inside its own container (PAGE-FRAMEWORK) so wide content
//     never makes the page scroll sideways.

function ComparisonBlock({
  title,
  kicker,
  grid,
  offerings,
  openId,
}: {
  title: string
  kicker: string
  grid: FeatureGrid
  offerings: Offering[]
  openId: string
}) {
  const priceById = new Map(offerings.map((o) => [o.id, o]))
  return (
    <div>
      <div className="mb-5">
        <h3 className="font-display uppercase text-text text-2xl">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{kicker}</p>
      </div>

      {/* Mobile: one collapsible per plan. */}
      <div className="space-y-3 lg:hidden">
        {grid.columns.map((column, i) => {
          const offering = priceById.get(column.id)
          return (
            <details
              key={column.id}
              open={column.id === openId}
              className="rounded-2xl border border-border bg-surface"
            >
              <summary className="flex cursor-pointer items-baseline justify-between gap-3 px-5 py-4">
                <span className="font-display uppercase text-text text-xl">{column.label}</span>
                <span className="text-sm font-bold text-primary-strong">{offering?.monthly}</span>
              </summary>
              <div className="border-t border-border px-5 pb-5 pt-2">
                {grid.groups.map((group) => (
                  <div key={group.key} className="mt-4 first:mt-2">
                    <h4 className="mb-2 text-2xs font-black uppercase tracking-wider text-subtle">
                      {group.label}
                    </h4>
                    <dl className="space-y-2">
                      {group.rows.map((row) => (
                        <div key={row.key} className="flex items-start justify-between gap-4">
                          <dt className="text-sm text-muted">{row.label}</dt>
                          <dd className="shrink-0 text-right text-sm">
                            <Cell cell={row.cells[i]!} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </details>
          )
        })}
      </div>

      {/* Desktop: the real table. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border lg:block">
        <table className="w-full text-left">
          <caption className="sr-only">{`${title}: what each plan includes`}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th scope="col" className="w-64 px-5 py-4 align-bottom text-sm font-bold text-text">
                Feature
              </th>
              {grid.columns.map((column) => {
                const offering = priceById.get(column.id)
                return (
                  <th
                    key={column.id}
                    scope="col"
                    className={`px-5 py-4 align-bottom ${offering?.featured ? 'bg-primary-bg/30' : ''}`}
                  >
                    <span className="block font-display uppercase text-text text-xl">{column.label}</span>
                    <span className="mt-1 flex items-baseline gap-1.5">
                      {offering?.listAnchor && (
                        <span className="text-2xs font-semibold text-subtle line-through">
                          {offering.listAnchor}
                        </span>
                      )}
                      <span className="text-sm font-bold normal-case text-primary-strong">
                        {offering?.monthly}
                      </span>
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          {grid.groups.map((group) => (
            <tbody key={group.key} className="text-sm">
              <tr className="border-b border-border bg-surface-elevated/60">
                <th
                  scope="colgroup"
                  colSpan={grid.columns.length + 1}
                  className="px-5 py-2 text-2xs font-black uppercase tracking-wider text-subtle"
                >
                  {group.label}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.key} className="border-b border-border last:border-0">
                  <th scope="row" className="px-5 py-3 align-top font-semibold text-text">
                    {row.label}
                    <span className="mt-0.5 block text-xs font-normal leading-relaxed text-subtle">
                      {row.detail}
                    </span>
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={grid.columns[i]!.id}
                      className={`px-5 py-3 align-top ${
                        priceById.get(grid.columns[i]!.id)?.featured ? 'bg-primary-bg/15' : ''
                      }`}
                    >
                      <Cell cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )
}

/** One resolved cell. A yes reads as a check, a no reads as a muted dash with its reason, and a value
 *  (an allowance, a rate, an add-on price) reads plainly. The text is always present for screen readers. */
function Cell({ cell }: { cell: GridCell }) {
  if (cell.kind === 'yes') {
    return (
      <span className="inline-flex items-center gap-1.5 text-success">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        {cell.text}
      </span>
    )
  }
  if (cell.kind === 'no') {
    return (
      <span className="inline-flex items-center gap-1.5 text-subtle">
        <Minus className="h-4 w-4 shrink-0" aria-hidden />
        {cell.text}
      </span>
    )
  }
  return <span className="font-semibold text-text">{cell.text}</span>
}
