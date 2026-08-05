import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
  PhotoHero,
  Section,
  SectionHeading,
  BlockHeading,
  Statement,
  BetaCTA,
  FaqList,
  Button,
  Card,
} from '@/components/marketing/marketing-ui'
import {
  ComparisonTable,
  type ComparisonColumn,
  type ComparisonGroup,
} from '@/components/marketing/comparison-table'
import { JsonLd } from '@/components/json-ld'
import { Illustration } from '@/components/marketing/illustrations'
import { breadcrumbSchema, faqSchema, productSchema } from '@/lib/jsonld'
import { Reveal } from '@/components/marketing/motion'
import { PricingComparison } from '@/components/marketing/pricing-comparison'
import {
  PricingBillingToggle,
  PricingIntervalScope,
} from '@/components/marketing/pricing-billing-toggle'
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
  type Offering,
  type PlanExtra,
  type PricingGridInput,
} from '@/lib/pricing/pricing-grid'
import { MISSION_FRAMING, PLAN_STORY } from '@/lib/pricing/pricing-page'
import { BlockRender } from '@/lib/page-editor/block-render'
import { BlockDocJsonLd } from '@/lib/page-editor/block-seo'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { isRenderable } from '@/lib/page-editor/templates'
import { getLiveData } from '@/lib/page-editor/live-data'
import { createAdminClient } from '@/lib/supabase/admin'

// EVERY figure on this page is READ, never written. Prices, the yearly deal, the trial length, the
// per-tier take-rate, the add-on and seat amounts, and every cell of the comparison grid come from
// lib/pricing/pricing-grid.ts, which derives them from the operator-editable pricing config
// (pricing_settings, edited at /admin/pricing) and from the entitlement key sets the product actually
// gates on. So an operator changing a price changes this page with no deploy, and moving a capability
// between tiers moves it in the grid. There is no dollar figure, and no percentage, in this file.
//
// SPEED: the page is ISR (revalidate below). The two config reads are request-cached and happen once per
// revalidation, not per visitor. Every price renders statically at BOTH intervals; the monthly/yearly
// toggle (owner: "keep the billing toggle") is the one page-specific client island, and it holds no
// price data — it flips a data-interval attribute and CSS shows the matching span, exactly the
// pre-rebuild wiring, now scoped across the two DAWN 2 plan bands.
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

/** The NETWORK half of an offering's rate line ("5% on network-sourced sales"). The 0%-on-your-own half
 *  is the promise every rung shares, so a sentence that already states it once reads the network half
 *  alone rather than repeating the promise per rung. Read off the offering, never typed. */
function networkRate(offering: Offering): string {
  return offering.takeRate.split(', ')[1] ?? offering.takeRate
}

/** The COMPACT ladder for a meta description, where length is the constraint: label + price, no beta
 *  prose, no free rung (the sentence before it already says selling is free on every plan). Separate
 *  from `ladderSentence` on purpose — the page has room to explain the beta anchor and a `<meta>` tag
 *  does not, and sharing one string forced the page's fuller phrasing past the SERP cut. */
function ladderCompact(offerings: Offering[]): string {
  return offerings
    .filter((o) => o.monthlyCents > 0)
    // Independent is dropped HERE ONLY. It is a real tier and the page lists it, but it is a
    // network-disconnected white-label plan nobody arrives at from a search result, and at ~$249 it is
    // the longest string on the ladder. Spending a quarter of the description's budget on the rung
    // least likely to be the reader's next step is the wrong trade in a field this short.
    .filter((o) => o.tier !== 'independent')
    .map((o) => `${o.label} ${o.monthly}`)
    .join(', ')
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
  const ladder = ladderCompact(spaceOfferings(input))
  // 🔴 THE PAYLOAD HAS TO FIT. This was 372 characters, so every derived figure sat past the ~155-160
  // character SERP cut and truncation began mid-sentence at "A paid plan buys down t…". The one thing
  // the derivation work exists to publish was the part nobody would ever read.
  //
  // Rebuilt around the two facts worth the space: the promise, and the plan ladder. The longer story
  // lives on the page and in the FAQ schema, which have no length limit. Still fully interpolated, so
  // an operator price change moves it.
  // Phrased WITHOUT a literal percentage on purpose. The page-source guard bans any bare `\d{1,2}%`
  // here, and it is right to: a typed figure in this file is exactly the drift the derivation work
  // removed, and "0%" typed by hand is indistinguishable to the guard from "8%" typed by hand. Saying
  // it in words costs nothing and keeps the rule absolute rather than carved with an exception.
  const description = `We take nothing on your own people, ever. Selling is free on every plan. ${ladder}.`
  return {
    title: 'Pricing: your own people are always free',
    description,
    alternates: { canonical: '/pricing' },
    openGraph: {
      title: 'Frequency pricing: your own people are always free',
      description,
      url: '/pricing',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Frequency pricing: your own people are always free',
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
      a: `Selling is free on every plan, and your own people are always free. What a paid plan buys is a lower rate on the sales the network introduces, plus the tools that build the list which takes that rate to zero. There are two ladders. Membership: ${member!.label} is free forever and already hosts events, takes RSVPs, sells tickets, and takes donations at ${networkRate(member!)}; ${crew!.label} is ${crew!.monthly} and takes that to ${networkRate(crew!)} with the caps off. Spaces: ${ladder} ${annualDiscountNote(input.values)}`,
    },
    {
      q: 'Can I run a Space for free?',
      a: `Yes, and anyone can. A free Space is a real Space, not a trial: your storefront, your page, events, posts, members, a shop, and a place for your people to gather. It sells tickets and takes donations from day one, at ${networkRate(spaces[0]!)}. You do not need Crew to run one. No card, no clock.`,
    },
    {
      q: 'What actually needs a paid plan?',
      a: 'Three things, and we name them plainly. Selling memberships needs Business, because a membership is a recurring promise to another person. Campaigns and funnels need Business, which is the line between messaging your own people and running an acquisition machine. Splitting revenue between businesses needs Collective, because that is what a collective is for. Everything else is a meter with a real free allowance, and a full meter stops new writes without ever hiding, deleting, or locking what is already there.',
    },
    {
      q: 'What stays free forever?',
      a: 'The people part, and the transaction. Joining Frequency, belonging to Circles, going to events, following Spaces, and messaging never cost anything, for members or for you. Taking money never sits behind a plan either: every rung sells tickets and takes donations, and tips carry no fee on any rung. A business never pays for access to people.',
    },
    ...betaFaq,
    {
      q: 'Do you take a cut of my sales?',
      a: `Not of your own. You keep 100% of the bookings and sales you bring in yourself, always, and tips are never touched. We earn a share only of a sale the network introduced, a referral or a discovery inside the collective, and that rate drops as your plan rises: ${rates}. Selling as a person rather than a Space needs no plan at all: ${member!.label} sells at ${networkRate(member!)} and ${crew!.label} at ${networkRate(crew!)}. Once a buyer is yours, meaning they follow you, they are one of your members, they are in your contacts, or they have bought before, we take nothing on them again: we charge once for the introduction, and after that they are your people, free.`,
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
  // ── OPERATOR-PUBLISHED CONTENT WINS (owner directive, ADR-916) ─────────────────────────────
  //
  // `pricing` has been a row in EDITABLE_PAGES all along, so a janitor could open /edit/pricing,
  // rewrite the whole page, hit Publish, and see it saved. A visitor saw NONE of it, because this
  // route never read the published document the way the six other Puck-backed marketing pages do. An
  // operator control that silently does nothing is worse than no control: it invites someone to spend
  // an afternoon on copy that will never ship, and gives them no signal that it did not.
  //
  // 🔴 THE FALLBACK IS THE CODED PAGE, NOT getTemplate('pricing'). Every other route falls back
  // published -> template -> legacy, because their coded page is a last-resort relic. Here the
  // relationship is inverted: the coded page below is the DERIVED one, reading live prices, live
  // rates, and the real gate map, with no dollar figure or percentage typed anywhere in it. The Puck
  // template is a static document. Slotting it in as a middle rung would mean any deploy where nobody
  // has published silently downgrades /pricing from live figures to a snapshot. So there are two
  // rungs, not three, and the ordering says exactly what it means: a human's published words beat the
  // generated page, and nothing else does.
  const input = await pricingInput()
  const members = memberOfferings(input)
  const spaces = spaceOfferings(input)

  // The named offerings the DAWN 2 card rows place (row one: the free trio; row two: the paid Space
  // plans, with Independent on its quiet strip). Looked up by stable id, so a ladder reorder in the
  // model cannot shuffle the reference layout; every one is still the model's own object.
  const member = members[0]!
  const crew = members[1]!
  const spacesById = new Map(spaces.map((o) => [o.id, o]))
  const spaceFree = spacesById.get('free')!
  const business = spacesById.get('business')!
  const collective = spacesById.get('collective')!
  const nonprofit = spacesById.get('nonprofit')!
  const independent = spacesById.get('independent')

  // 🔴 THE PRICE SCHEMA IS EMITTED ON BOTH BRANCHES, and hoisting it here is the whole point.
  //
  // One Product/Offer per PAID offering. A free tier is not an Offer (a zero-price Product reads as
  // spam to answer engines; the FAQ carries the free story instead). Built from the same model the
  // page renders, so the schema can never drift from the table.
  //
  // It sits ABOVE the published-document branch because these are pure DERIVED PRICE FACTS: they come
  // from the offering model, not from anybody's copy, so they are equally true whichever body renders.
  // Leaving them below meant one Publish at /edit/pricing silently deleted every price node from the
  // highest-value answer-engine surface on the site — the exact asset this work exists to build, taken
  // out by an operator editing a paragraph and having no way to know.
  const priceSchema = [...members, ...spaces]
    .filter((o) => o.monthlyCents > 0)
    .map((o) =>
      productSchema({
        title: `Frequency ${o.label}`,
        description: o.forWho,
        priceCents: o.monthlyCents,
        currency: 'usd',
        // Every plan here is a MONTHLY subscription. Without this the Offer publishes a bare price and
        // a $19/mo plan reads as a flat $19 purchase.
        billingPeriodCode: 'MON',
        path: '/pricing',
        sellerName: 'Frequency',
      }),
    )

  const published = await getPublishedData('pricing')
  if (isRenderable(published)) {
    const live = await getLiveData(createAdminClient()).catch(() => null)
    return (
      <>
        <JsonLd data={[breadcrumbSchema([{ name: 'Pricing', path: '/pricing' }]), ...priceSchema]} />
        {/* Article schema for the published doc, the same way every other Puck-backed marketing route
            emits it (about, the-community, the-lab, the-quest). Without it a published /pricing ships
            strictly less structured data than the generated one it replaces.
            ⚠️ The FAQPage schema is deliberately NOT carried over: it is generated from the coded
            page's own FAQ copy, and asserting those answers over a body an operator has rewritten
            would publish text no visitor can see. The published document carries its own. */}
        <BlockDocJsonLd data={published} path="/pricing" />
        <BlockRender config={config} data={published} metadata={live ? { live } : {}} />
      </>
    )
  }

  const extras = planExtras(input)
  const faq = pricingFaq(input)
  const ladder = ladderSentence(spaces)

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([{ name: 'Pricing', path: '/pricing' }]),
          faqSchema(faq),
          ...priceSchema,
        ]}
      />

      <PhotoHero
        image="/images/site/lab-lounge.jpg"
        alt="The connection bar inside The Lab, warm and low-lit"
        focal="object-center"
        eyebrow="Every plan, side by side"
        title={
          <>
            Your own people are
            <br className="hidden sm:block" /> <span className="text-primary">always free.</span>
          </>
        }
        subtitle={`Selling is free on every plan. We take nothing on a follower, a member, a contact, or anyone who bought from you before. On a sale the network introduces we take a share, and every rung down the ladder makes it smaller. ${ladder}. The grid below is the proof.`}
      >
        <Button href="/spaces">
          Start a Space <ArrowRight className="h-5 w-5" />
        </Button>
      </PhotoHero>

      {/* Mission framing, stated plainly, with the "we only earn when you do" infographic. */}
      <Section tone="canvas">
        <div className="mx-auto mb-6 h-28 w-full max-w-xs">
          <Illustration name="earn-together" className="h-full" />
        </div>
        <p className="text-center text-body-lg leading-relaxed text-muted sm:text-lead">{MISSION_FRAMING}</p>
      </Section>

      {/* The CSS that drives the monthly/yearly toggle island: hide the interval the wrapper is not on.
          The scope wrapper carries data-interval; each price span carries data-interval-show. No client
          JS in the page itself; the toggle (a client island) only flips the wrapper attribute. */}
      <style>{`
        [data-interval='month'] [data-interval-show='year'] { display: none; }
        [data-interval='year'] [data-interval-show='month'] { display: none; }
      `}</style>

      {/* THE PLANS (DAWN 2 structure, design_handoff/dawn/ui_kits/marketing/pricing.html). Two bands
          instead of two side-by-side ladders. Row one, cream: everything a person starts free, Member ·
          Crew · Space, with Crew the wide, floating middle card. Row two, ink: the paid Space plans,
          Business · Collective · Non Profit, Collective floating. Independent stays on the page as the
          quiet full-width strip under the ink row. Every figure still reads off the offering model
          (operator config), never this file; the float reads Offering.featured, so the emphasized card
          and the model's emphasis cannot disagree. One billing toggle governs both bands, so a reader
          compares monthly against monthly. */}
      <PricingIntervalScope>
        <Section tone="canvas" width="wide">
          <SectionHeading
            align="center"
            eyebrow="The plans"
            title="Pick the plan that fits."
            kicker="Two ladders. One for you as a member, one for the Space you run. Every rung on both sells, so the only thing that moves down the ladder is the rate. You can be on both, and you can start on the free rung of either."
          />
          <PricingBillingToggle yearlyNote={annualDiscountNote(input.values)} />
          <div className="stagger grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
            <PlanCard offering={member} />
            <PlanCard offering={crew} />
            <PlanCard offering={spaceFree} />
          </div>
        </Section>

        <Section tone="ink" width="wide" className="spot relative overflow-hidden">
          <div className="relative z-10">
            <SectionHeading
              tone="ink"
              align="center"
              title="For your Space"
              kicker="A Space is free for anyone to start, and a free Space sells. The paid plans buy the rate down and lift the caps."
            />
            <div className="stagger grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
              <PlanCard offering={business} tone="ink" />
              <PlanCard offering={collective} tone="ink" />
              <PlanCard offering={nonprofit} tone="ink" />
            </div>
            {independent && <IndependentStrip offering={independent} />}
            <p className="mx-auto mt-10 max-w-2xl text-center text-body leading-relaxed text-on-ink-muted">
              {annualDiscountNote(input.values)} Never a wall in front of the transaction.{' '}
              {PLAN_STORY.meters} You keep 100% of your own bookings on every rung: the take-rate
              applies only to a sale the network introduced, and it drops as your plan rises. Once
              someone is yours, a follower, one of your members, a contact, or a past buyer, we take
              nothing on them again. We charge once for the introduction. After that they are your
              people, free.
            </p>
          </div>
        </Section>
      </PricingIntervalScope>

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
      <Section tone="surface" width="wide">
        <SectionHeading
          eyebrow="The full comparison"
          title="What each plan gets."
          kicker="Every row below is read from the same rules the product runs on, so this table says what your account will actually do."
        />

        {/* The default-open mobile column is the FEATURED offering (the same flag the cards float and
            the table emphasizes), so no surface on this page crowns a different plan. */}
        <ComparisonBlock
          title="Membership"
          kicker="What you get as a person, on the free tier and on Crew."
          grid={memberFeatureGrid(input)}
          offerings={members}
          openId={members.find((o) => o.featured)?.id ?? members[0]!.id}
        />

        <div className="mt-14">
          <ComparisonBlock
            title="Spaces"
            kicker="What a Space gets on each plan, from free to Independent."
            grid={spaceFeatureGrid(input)}
            offerings={spaces}
            openId={spaces.find((o) => o.featured)?.id ?? spaces[0]!.id}
          />
        </div>
      </Section>

      {/* The value comparison: every Business feature vs the separate tool it replaces, totaled against the
          one flat price. Reads the pure lib/pricing/comparison catalog. */}
      <Section tone="canvas" width="wide">
        <SectionHeading
          eyebrow="What it replaces"
          title="One price. The whole toolbox."
          kicker="Every tool a growing business stitches together, and what each one costs on its own. On Frequency it is one login, one bill, one flat price."
        />
        <PricingComparison />
      </Section>

      {/* The four brand promises that make it a collective, not a SaaS (ADR-811 §1a). Surface, not
          canvas: the value comparison above and the Statement below are both canvas, and three canvas
          bands in a row read as one undifferentiated block. */}
      <Section tone="surface">
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
            <Card key={p.title} tone="feature">
              <h3 className="font-display uppercase text-text text-lead">{p.title}</h3>
              <p className="mt-2 text-body-sm leading-relaxed text-muted">{p.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Statement tone="canvas">
        You pay for the parts of the business{' '}
        <span className="text-primary-strong">you actually run.</span>
      </Statement>

      {/* Earned, not bought: roles never come from a checkout. */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="A note on status"
          title="Host, Guide, and Mentor are earned, not bought."
          kicker="You cannot buy your way to the front of the room."
        />
        <p className="text-body-lg leading-relaxed text-muted">
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

// ── The plan cards (DAWN 2) ──────────────────────────────────────────────────
// One card per offering, in a light (cream band) and an ink (bg-slat band) dress. Every string comes
// off the Offering (which is built from the pricing config), so a card holds no pricing logic of its
// own. Semantic DAWN tokens only.
//
// KIT NOTE: these are page-local rather than marketing-ui pieces because the kit `Card` and `Button`
// carry no ink tone yet. If a second surface needs an on-ink card or CTA, promote these to the kit.

/** One plan card. The featured card is the row's floating middle card (lift-2, primary border, the
 *  badge, wider via the grid's 1.2fr middle column and taller via the negative block margin, exactly
 *  the reference's silhouette). Non-featured cards rest on the page (lift-1) and center vertically.
 *
 *  `featured` READS the model (`Offering.featured`: Crew + Collective, the DAWN 2 reference's "Best
 *  choice" pair the owner adopted; see the flag's doc in lib/pricing/pricing-grid.ts), never a page
 *  prop — a prop here is how the page float and the comparison emphasis came to crown different
 *  plans. */
function PlanCard({
  offering,
  tone = 'light',
}: {
  offering: Offering
  tone?: 'light' | 'ink'
}) {
  const ink = tone === 'ink'
  const featured = offering.featured
  const shell = featured
    ? `lift-2 border-2 border-primary p-7 sm:p-8 lg:-my-4 ${
        ink ? 'bg-on-ink/5' : 'bg-surface ring-4 ring-primary-bg'
      }`
    : `lift-1 border p-6 ${ink ? 'border-on-ink/10 bg-on-ink/5' : 'border-border bg-surface'}`
  return (
    <Reveal as="article" className={`relative flex flex-col rounded-card ${shell}`}>
      {featured && (
        <span className="absolute -top-3 left-6 rounded-md bg-primary px-2 py-0.5 text-3xs font-black uppercase tracking-wider text-on-primary">
          Most chosen
        </span>
      )}
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
function PlanPrice({
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
function PlanCta({
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
      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-on-ink/20 bg-on-ink/10 px-8 py-3.5 text-body font-bold text-on-ink transition-colors hover:bg-on-ink/15"
    >
      {offering.cta.label}
    </Link>
  )
}

/** Independent, the off-network white-label build, as the quiet full-width strip under the ink row
 *  (the reference keeps the six-card grid and hands Independent one line; the strip keeps its real
 *  operator-set price and copy on the page instead). */
function IndependentStrip({ offering }: { offering: Offering }) {
  return (
    <Reveal
      as="article"
      className="lift-1 mt-8 flex flex-col gap-5 rounded-card border border-on-ink/10 bg-on-ink/5 p-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-display uppercase text-page-title text-on-ink">{offering.label}</h3>
          {/* The strip sits inside the interval scope too, so its figure flips with the toggle. */}
          <span className="font-display text-lead text-primary">
            <span data-interval-show="month">{offering.monthly}</span>
            <span data-interval-show="year">{offering.yearly ?? offering.monthly}</span>
          </span>
        </div>
        <p className="mt-1 text-body-sm font-semibold text-on-ink-muted">{offering.tagline}</p>
        <p className="mt-2 max-w-2xl text-body-sm leading-relaxed text-on-ink-muted">{offering.forWho}</p>
        <p className="mt-2 text-body-sm text-on-ink-subtle">{offering.takeRate}</p>
      </div>
      <div className="shrink-0">
        <Link
          href={offering.cta.href}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-on-ink/20 bg-on-ink/10 px-8 py-3.5 text-body font-bold text-on-ink transition-colors hover:bg-on-ink/15"
        >
          {offering.cta.label}
        </Link>
      </div>
    </Reveal>
  )
}

function ExtraCard({ extra }: { extra: PlanExtra }) {
  return (
    <Card tone="feature">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display uppercase text-text text-page-title">{extra.label}</h3>
        <span className="font-display text-primary-strong text-lead">{extra.price}</span>
      </div>
      <p className="mt-2 text-body-sm leading-relaxed text-muted">{extra.detail}</p>
      <p className="mt-2 text-body-sm font-semibold text-text">{extra.availability}</p>
    </Card>
  )
}

// ── The comparison grid ──────────────────────────────────────────────────────
// This block used to carry its own desktop table, its own mobile stack, and its own `Cell` — a second
// implementation of the one the value comparison further down the page already had. Both now compose
// components/marketing/comparison-table.tsx. What is left here is the ADAPTER: the pure FeatureGrid
// (columns + grouped rows, resolved from the entitlement key sets) mapped onto that renderer's shape,
// with the price furniture a plan column carries in its header and on its mobile summary.

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

  const columns: ComparisonColumn[] = grid.columns.map((column) => {
    const offering = priceById.get(column.id)
    return {
      id: column.id,
      label: column.label,
      emphasis: offering?.featured ?? false,
      summary: offering?.monthly,
      note: (
        <span className="flex items-baseline gap-1.5">
          {offering?.listAnchor && (
            <span className="text-2xs font-semibold text-muted line-through">{offering.listAnchor}</span>
          )}
          <span className="text-body-sm font-bold text-primary-strong">{offering?.monthly}</span>
        </span>
      ),
    }
  })

  const groups: ComparisonGroup[] = grid.groups.map((group) => ({
    key: group.key,
    label: group.label,
    rows: group.rows.map((row) => ({
      key: row.key,
      label: row.label,
      detail: row.detail,
      cells: row.cells,
    })),
  }))

  return (
    <div>
      <BlockHeading title={title} kicker={kicker} />
      <ComparisonTable
        caption={`${title}: what each plan includes`}
        rowHeader="Feature"
        columns={columns}
        groups={groups}
        mobile="by-column"
        openId={openId}
      />
    </div>
  )
}
