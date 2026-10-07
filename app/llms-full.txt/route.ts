import { getAllCategories, helpHref } from '@/lib/help/content'
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION, SITE_TAGLINE, CONTACT_EMAIL, FOUNDING_PLACE } from '@/lib/site'
import { loadPricingInput } from '@/lib/pricing/pricing-input'
import { allOfferings, type Offering } from '@/lib/pricing/pricing-grid'
import { offeringLadderLabel, paidWallsPhrase, PLAN_STORY } from '@/lib/pricing/pricing-page'
import { EDITABLE_PAGES, pathForSlug } from '@/lib/page-editor/data'
import type { ArticleSpec } from '@/lib/page-editor/templates/article'
import { spec as howToStartACircle } from '@/lib/page-editor/templates/how-to-start-a-circle'
import { spec as howToBuildCommunity } from '@/lib/page-editor/templates/how-to-build-community'
import { spec as loneliness } from '@/lib/page-editor/templates/loneliness'
import { spec as friendshipAsAnAdult } from '@/lib/page-editor/templates/friendship-as-an-adult'
import { spec as calmDownFast } from '@/lib/page-editor/templates/calm-down-fast'
import { spec as howToBeMoreSocial } from '@/lib/page-editor/templates/how-to-be-more-social'
import { spec as toolsForCommunityBuilders } from '@/lib/page-editor/templates/tools-for-community-builders'
import { spec as whatIsFrequency } from '@/lib/page-editor/templates/what-is-frequency'
import { COMPARISONS, comparisonCopy, comparisonPath } from '@/lib/marketing/comparisons'
import { WHO_FREQUENCY_IS_FOR, WHO_FREQUENCY_IS_FOR_HEADING } from '@/lib/marketing/who-its-for'

// /llms-full.txt — the comprehensive, self-maintaining companion to the curated /llms.txt route
// (AIO, docs/CONTENT-VOICE §8). Where llms.txt is a hand-written brand summary, this dumps the
// full help-center content (every published article's title, URL, description, and body) so AI
// answer engines can ingest the real product documentation, ATOP a canonical "About Frequency"
// header that states the Community Collective positioning, the honest-money model, the four brand
// promises, and the live tier ladder. Every price and every rate is READ from lib/pricing/pricing-grid.ts,
// the same derived model /pricing renders, resolved against the operator's editable config, so this
// corpus cannot publish a ladder the page has stopped showing and the beta-window anchors auto-revert on
// the cutover instant. Generated at request time (ISR), never stale.
// Public, non-sensitive, server-rendered text. No em dashes (CONTENT-VOICE punctuation rule).

export const revalidate = 3600


/** The network-only take-rate, one line per rung, straight off the offerings. Every ADVERTISED rung is
 *  listed, so the ladder cannot silently omit one the way a hand-written list did (it named Member,
 *  Business, Collective, and Non Profit, and left out Crew and the free Space). What is advertised is
 *  decided in one place, lib/pricing/display.ts, so a tier sold by hand rather than published (LIVE-227)
 *  drops out of this corpus without an edit here. Nothing in this file names a tier. */
function takeRateLines(offerings: Offering[]): string[] {
  return offerings.map((o) => `- ${offeringLadderLabel(o)}: ${o.takeRate}.`)
}

/** The tier-ladder lines, priced from the same model /pricing renders, so the ladder here matches the
 *  table exactly and the beta anchors revert on the same cutover. Member and Crew are the personal rungs
 *  and lead, then the Space rungs, which is the order allOfferings returns. */
function tierLadderLines(offerings: Offering[]): string[] {
  return offerings.map((o) => {
    const anchor = o.listAnchor ? ` (list ${o.listAnchor})` : ''
    const yearly = o.yearly ? ` or ${o.yearly}` : ''
    return `- ${offeringLadderLabel(o)}: ${o.monthly}${anchor}${yearly}. ${o.forWho} Take-rate: ${o.takeRate}.`
  })
}

/** The seeker articles' static specs, keyed by their EDITABLE_PAGES slug (SCAN-796). The spec is the
 *  seed the editor publishes from, so this reads the answer-first copy with no database round trip; a
 *  published edit to one of these pages is not reflected here until the spec moves with it. A slug in
 *  EDITABLE_PAGES with no spec here (the six primary pages) is simply not an article and is skipped. */
const ARTICLE_SPECS: Record<string, ArticleSpec> = {
  'how-to-start-a-circle': howToStartACircle,
  'how-to-build-community': howToBuildCommunity,
  loneliness,
  'friendship-as-an-adult': friendshipAsAnAdult,
  'calm-down-fast': calmDownFast,
  'how-to-be-more-social': howToBeMoreSocial,
  'tools-for-community-builders': toolsForCommunityBuilders,
  'what-is-frequency': whatIsFrequency,
}

/** One question and its answer, in the form an answer engine lifts whole. */
function qaLines(faq: { q: string; a: string }[]): string[] {
  return faq.flatMap((f) => [`Q: ${f.q}`, `A: ${f.a}`])
}

/** The pages written to be quoted: each seeker article's answer and FAQ, then each comparison's FAQ.
 *  Fail-safe to an empty list, so a bad spec can never take the help center down with it. */
function guidesAndAnswers(): string[] {
  const out: string[] = []
  try {
    for (const page of EDITABLE_PAGES) {
      const spec = ARTICLE_SPECS[page.slug]
      if (!spec) continue
      out.push('', `### ${spec.title}`, `${SITE_URL}${pathForSlug(page.slug)}`, spec.answer, ...qaLines(spec.faq))
    }
    for (const c of COMPARISONS) {
      const copy = comparisonCopy(c)
      out.push('', `### ${copy.h1}`, `${SITE_URL}${comparisonPath(c.slug)}`, copy.lede, ...qaLines(copy.faq))
    }
  } catch {
    return []
  }
  return out
}

export async function GET() {
  const [cats, input] = await Promise.all([getAllCategories(), loadPricingInput()])
  const offerings = allOfferings(input)

  const out: string[] = [
    `# ${SITE_NAME}: full content for language models`,
    '',
    `> ${SITE_DESCRIPTION} ${SITE_TAGLINE}. Taking root in ${FOUNDING_PLACE}. Contact: ${CONTACT_EMAIL}.`,
    '',
    `Curated short version: ${SITE_URL}/llms.txt`,
    '',
    '## About Frequency',
    '',
    'Frequency is a Community Collective. We exist to support every community effort and help everyone in it succeed, together. Everything a community needs sits in one place: start a Circle, host Events near you, and grow a Space (your own community, business, or nonprofit). The Quest is the light game everyone plays alongside that.',
    '',
    `### ${WHO_FREQUENCY_IS_FOR_HEADING}`,
    '',
    ...WHO_FREQUENCY_IS_FOR.map((line) => `- ${line}`),
    '',
    '### The honest-money model',
    '',
    // LIVE-253: "a paid plan buys a lower rate, not permission" got the second half right and the
    // first half backwards, and the paragraph then closed on "that rate drops as your plan rises",
    // so the corpus argued the fee ladder twice. Both halves are PLAN_STORY now.
    `People join free. Businesses host free. You pay when you start charging. ${PLAN_STORY.ladder} ${PLAN_STORY.paid} ${PLAN_STORY.selling} ${PLAN_STORY.rate} You keep 100% of your own bookings, always, and tips carry no fee on any rung. We earn only a small fee on a customer the network introduces, once, never on what you bring in yourself. Where each rung lands:`,
    ...takeRateLines(offerings),
    '',
    // The walls and the plan each opens at are READ off the gate map (paidWallsPhrase), the same
    // merge /pricing and /llms.txt do, so this line cannot name a plan for a wall the product does
    // not enforce. It used to type "revenue splits (Collective)" for a gate HYG-079 had deleted.
    `${paidWallsPhrase(input.gateOverrides) === 'nothing' ? PLAN_STORY.selling : `What needs a paid plan: ${paidWallsPhrase(input.gateOverrides)}.`} ${PLAN_STORY.meters}`,
    '',
    'Physical Spaces (Outposts and Frequency Labs) are funded by a separate community-owned vehicle, never out of platform margin.',
    '',
    '### The four promises',
    '',
    '1. We never take a cut of your own bookings or your tips.',
    '2. One honest price, no surprise invoices.',
    '3. Month to month. Take your data and leave anytime.',
    '4. See exactly what the network earned you.',
    '',
    '### The tier ladder',
    '',
    ...tierLadderLines(offerings),
    '',
    `Full pricing: ${SITE_URL}/pricing`,
    '',
    // The answer-first guides and the comparison pages, before the help center, so an engine that
    // takes this file as the whole corpus sources what Frequency is from here rather than from a
    // third party (SCAN-796).
    '## Guides and answers',
    ...guidesAndAnswers(),
    '',
    '## Help center',
  ]

  for (const cat of cats) {
    out.push('', `### ${cat.title}`)
    if (cat.description) out.push(cat.description)
    for (const a of cat.articles) {
      out.push(
        '',
        `#### ${a.title}`,
        `${SITE_URL}${helpHref(cat.slug, a.slug)}`,
      )
      if (a.updated) out.push(`Updated: ${a.updated}`)
      if (a.description) out.push(a.description)
      // The body as the corpus carries it (SCAN-806). Root-relative markdown links become absolute,
      // so an engine can resolve and cite them, and every heading is demoted three levels so a body
      // `##` sits under the `####` article title instead of outranking it (`##` -> `#####`,
      // `###` -> `######`; +3 keeps the two apart where +4 would flatten both to `######`). The
      // heading regex also matches inside a fenced code block; no help body carries a `#` fence.
      out.push(
        '',
        a.body
          .trim()
          .replace(/\]\(\/(?!\/)/g, `](${SITE_URL}/`)
          .replace(/^(#{1,6})[ \t]/gm, (_m, h: string) => '#'.repeat(Math.min(h.length + 3, 6)) + ' '),
      )
    }
  }

  return new Response(out.join('\n') + '\n', {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
