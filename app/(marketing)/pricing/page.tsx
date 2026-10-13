import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import { PhotoHero, BetaCTA, Button } from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, faqSchema, productSchema } from '@/lib/jsonld'
import { PricingAudienceScope, PricingIntervalScope } from '@/components/marketing/pricing-billing-toggle'
import { getPricingValues } from '@/lib/pricing/settings'
import { catalogConfigByKey, loadCatalogConfig } from '@/lib/pricing/catalog-config'
import { isBetaPricingActive } from '@/lib/pricing/beta'
import { loadFeatureGateOverrides } from '@/lib/pricing/gates'
import {
  memberOfferings,
  planExtras,
  spaceFeatureGrid,
  spaceOfferings,
  type Offering,
  type PricingGridInput,
} from '@/lib/pricing/pricing-grid'
import { PLAN_STORY } from '@/lib/pricing/pricing-page'
import { BlockRender } from '@/lib/page-editor/block-render'
import { BlockDocJsonLd } from '@/lib/page-editor/block-seo'
import { config } from '@/lib/page-editor/config'
import { getPublishedPage, latestDay } from '@/lib/page-editor/data'
import { isWellFormed } from '@/lib/page-editor/templates'
import { getLiveData } from '@/lib/page-editor/live-data'
import { createAdminClient } from '@/lib/supabase/admin'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FrequencyPricing } from '@/components/frequency/site/pages/pricing/frequency-pricing'
import { pricingFaq } from './pricing-faq'
import {
  PricingDoors,
  PricingExtras,
  PricingFaq,
  PricingFeatureComparison,
  PricingFeeLadder,
  PricingMission,
  PricingPlans,
  PricingPromises,
  PricingStatus,
  PricingThesis,
  PricingToggleCss,
  PricingValue,
} from './pricing-sections'

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

/** The COMPACT ladder for a meta description, where length is the constraint: label + price, no beta
 *  prose, no free rung (the sentence before it already says hosting is free). Separate
 *  from `ladderSentence` on purpose — the page has room to explain the beta anchor and a `<meta>` tag
 *  does not, and sharing one string forced the page's fuller phrasing past the SERP cut. */
function ladderCompact(offerings: Offering[]): string {
  return offerings
    .filter((o) => o.monthlyCents > 0)
    .map((o) => `${o.label} ${o.monthly}`)
    .join(', ')
}

// Shared with the Article headline on the published branch so the two cannot drift (SCAN-802).
const TITLE = 'Pricing: your own people are always free'

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
  const description = `People join free. Businesses host free. You pay when you start charging, and never on your own people. ${ladder}.`
  return {
    title: TITLE,
    description,
    alternates: { canonical: '/pricing' },
    openGraph: {
      ...OG_SITE,
      images: ROOT_OG_IMAGES,
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

// Article dates (SCAN-781). datePublished is the day this route first shipped (repository history:
// 2026-06-02). The Article is only emitted on the published branch, where the pages row always
// carries a real published_at, so dateModified is that day and no UPDATED literal is needed.
const PUBLISHED = '2026-06-02'

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
  const [input, page, live] = await Promise.all([
    pricingInput(),
    getPublishedPage('pricing'),
    getLiveData(createAdminClient()).catch(() => null),
  ])
  const published = page?.doc ?? null
  const members = memberOfferings(input)
  const spaces = spaceOfferings(input)

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

  // The Frequency design (ADR-1737): the same model, the same FAQ, the same schema and the same CTA
  // hrefs, in the design's body. SITE_DESIGN is build-time, so a DAWN build never reaches this branch.
  // It sits ABOVE the published-document branch on purpose: a published /edit/pricing document is
  // drawn in DAWN blocks, and under Frequency it rendered those blocks inside the Frequency shell, a
  // DAWN page wearing the new header. The design's body reads the same live model, so nothing an
  // operator sets in /admin/pricing is lost.
  if (SITE_DESIGN === 'frequency') {
    const faq = pricingFaq(input)
    return (
      <>
        <JsonLd data={[breadcrumbSchema([{ name: 'Pricing', path: '/pricing' }]), faqSchema(faq), ...priceSchema]} />
        <FrequencyPricing members={members} spaces={spaces} grid={spaceFeatureGrid(input)} faq={faq} />
      </>
    )
  }

  if (isWellFormed(published)) {
    return (
      <>
        <JsonLd data={[breadcrumbSchema([{ name: 'Pricing', path: '/pricing' }]), ...priceSchema]} />
        {/* Article schema for the published doc, the same way every other Puck-backed marketing route
            emits it (about, the-community, the-lab, the-quest). Without it a published /pricing ships
            strictly less structured data than the generated one it replaces.
            ⚠️ The FAQPage schema is deliberately NOT carried over: it is generated from the coded
            page's own FAQ copy, and asserting those answers over a body an operator has rewritten
            would publish text no visitor can see. The published document carries its own. */}
        <BlockDocJsonLd
          data={published}
          path="/pricing"
          title={TITLE}
          published={PUBLISHED}
          updated={latestDay(PUBLISHED, page?.published_at)}
        />
        <BlockRender config={config} data={published} metadata={live ? { live } : {}} />
      </>
    )
  }

  const faq = pricingFaq(input)
  const pageSchema = [breadcrumbSchema([{ name: 'Pricing', path: '/pricing' }]), faqSchema(faq), ...priceSchema]

  const extras = planExtras(input)

  return (
    <>
      <JsonLd data={pageSchema} />

      <PhotoHero
        image="/images/site/lab-lounge.jpg"
        alt="The connection bar inside The Lab, warm and low-lit"
        focal="object-center"
        eyebrow="Pricing"
        title={
          <>
            Host free.
            <br className="hidden sm:block" /> <span className="text-primary">Pay when you start charging.</span>
          </>
        }
        subtitle={`${PLAN_STORY.ladder} Your own people are always free, and so are your tips.`}
      >
        <Button href="/spaces">
          Start a free Space <ArrowRight className="h-5 w-5" />
        </Button>
      </PhotoHero>

      <PricingMission />
      <PricingToggleCss />

      <PricingAudienceScope>
        <PricingIntervalScope>
          <PricingPlans input={input} members={members} spaces={spaces} />
        </PricingIntervalScope>
        <PricingFeeLadder members={members} spaces={spaces} />
        <PricingFeatureComparison input={input} members={members} spaces={spaces} />
      </PricingAudienceScope>

      <PricingExtras extras={extras} />
      <PricingDoors />
      <PricingValue />
      <PricingPromises />
      <PricingThesis />
      <PricingStatus />
      <PricingFaq faq={faq} />

      <BetaCTA
        heading="Open your Space for free."
        body="Host free for as long as you like. When you are ready to charge, Business is one step away, and your own people stay yours."
      />
    </>
  )
}
