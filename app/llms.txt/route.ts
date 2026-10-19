import {
  SITE_NAME,
  SITE_URL,
  SITE_TAGLINE,
  CATEGORY_LINE,
  CONTACT_EMAIL,
  FOUNDING_PLACE,
  SOCIAL_PROOF_FLOOR,
} from '@/lib/site'
import { createAdminClient } from '@/lib/supabase/admin'
import { funnelSlugs, getFunnelConfig } from '@/lib/marketing/funnel-config'
import { WHO_FREQUENCY_IS_FOR, WHO_FREQUENCY_IS_FOR_HEADING } from '@/lib/marketing/who-its-for'
import { COMPARISONS, comparisonCopy, comparisonPath } from '@/lib/marketing/comparisons'
import {
  pricingLadderSummary,
  offeringLadderLabel,
  paidWallsPhrase,
  PLAN_STORY,
} from '@/lib/pricing/pricing-page'
import { loadPricingInput } from '@/lib/pricing/pricing-input'
import { formatBps } from '@/lib/pricing/display'
import { allOfferings, type Offering, type PricingGridInput } from '@/lib/pricing/pricing-grid'
import { countUpcomingPublicSeries } from '@/lib/events/series-seo'
import { getAllCategories } from '@/lib/help/content'
import { listDensityCities } from '@/app/discover/cities/_data'
import { quickAnswers, quickAnswerLines } from '@/lib/marketing/quick-answers'
import { SELECTABLE_SKINS } from '@/lib/theme/skins'
import { SITE_DESIGN } from '@/lib/theme/design'

// NOT ONE FIGURE IN THIS FILE IS TYPED (Phase 5, ADR-916). Every price and every percentage below is
// READ from lib/pricing/pricing-grid.ts, the same derived model /pricing renders, resolved against the
// operator's editable config. This route is the single highest-leverage paragraph in the repo for what an
// answer engine will quote about our fees, and it spent a release quoting a ladder we had retired, then a
// release quoting a rate an operator had already changed at /admin/pricing. Both failures had the same
// cause: it kept its own copy of the numbers.


/** The whole money model in one citable sentence pair (ADR-913 / ADR-914), with the rate for EVERY rung
 *  read off the offerings, so a rung cannot be omitted and a number cannot go stale. The capabilities
 *  that need a paid plan, and the plan each opens at, are read off the gate map the same way
 *  (paidWallsPhrase), so this sentence can never name a plan for a wall the product does not enforce. */
function takeRateStory(input: PricingGridInput, offerings: Offering[]): string {
  // Only the rungs that take payments have a fee (ADR-1709). The personal tiers and the free Space take
  // tips only, at 0%, so they are named as such rather than given a rate nobody is charged.
  const rates = offerings
    .filter((o) => o.sells)
    .map((o) => `${offeringLadderLabel(o)} ${formatBps(o.networkRateBps)}`)
    .join(', ')
  const tipsOnly = offerings.filter((o) => !o.sells).map((o) => offeringLadderLabel(o)).join(', ')
  const walls = paidWallsPhrase(input.gateOverrides)
  // LIVE-253: this sentence used to tell eighteen named AI crawlers that "what a paid rung buys is
  // a lower rate plus the tools that build the list which takes that rate to zero", which is the
  // inverse of docs/CORE-MODEL.md. The reason and the rate are both PLAN_STORY now, one sentence
  // each, shared with /pricing so the corpus and the page cannot argue different models.
  return `People join free, businesses host free, and you pay when you start charging. ${PLAN_STORY.ladder} ${PLAN_STORY.paid} ${PLAN_STORY.selling} Tips only, with no platform fee, plus card processing: ${tipsOnly}. ${PLAN_STORY.rate} The network fee applies ONLY to a customer the network introduced, once: ${rates}. It is 0% for good once the buyer is already yours, meaning they follow your Space, they are one of your members, they are in your contacts, or they have bought from you before. Frequency charges once for the introduction. After that they are your people, free.${walls === 'nothing' ? '' : ` What needs a paid plan: ${walls}.`}`
}

/** The plain "the ladder is X, then Y" sentence, priced from the same offerings. It states the price
 *  a buyer pays today and nothing else: the "Opening Beta rate under the $X list" branch was dormant
 *  (no list anchor is set) and is gone (LIVE-912, LAUNCH-MARKETING-PLAN §7). */
function ladderSentence(offerings: Offering[]): string {
  return offerings
    .map((o) => `${offeringLadderLabel(o)} ${o.monthly}`)
    .join(', ')
}

// /llms.txt — the curated, short brand summary for language models (AIO,
// docs/CONTENT-VOICE §8). This is the hand-written companion to /llms-full.txt
// (which dumps the whole help center). It follows the llms.txt convention: an
// H1 title, a one-paragraph blockquote summary, then "## sections" of
// "- [label](url): description" links to the key public pages. Static text,
// no member data. Copy follows the locked voice and naming (Pillars, Channels,
// Circles, The Quest, Zaps, Gems); no em dashes.

export const revalidate = 86400

// Absolute URL from a public path, built off SITE_URL so it stays correct per env.
const abs = (path: string) => `${SITE_URL}${path}`

// The key public pages, each with a one-line description in the locked voice.
const pages = (input: PricingGridInput, offerings: Offering[]): { path: string; label: string; desc: string }[] => [
  { path: '/', label: 'Home', desc: `${SITE_NAME}. ${CATEGORY_LINE} The short version of who it is for and how it works.` },
  { path: '/the-community', label: 'The Community', desc: 'How you find your people, through Pillars, Channels, and Circles. For builders: host one Circle and we hand you the format and the first-night script.' },
  { path: '/pricing', label: 'Pricing', desc: `Pricing for Spaces and members: people join free, businesses host free, and you pay when you start charging. You keep 100% of your own bookings, after card processing. ${takeRateStory(input, offerings)} The whole ladder: ${ladderSentence(offerings)}.` },
  // /features and /vision are Frequency-design routes (they 404 under DAWN, and app/sitemap.ts lists
  // them only under Frequency), so this list names them only when the deploy serves them.
  ...(SITE_DESIGN === 'frequency'
    ? [
        { path: '/features', label: 'Features', desc: "Everything Frequency does for people and for Spaces: What's happening (the calendar), Circles, Events, door check-in, programs, contacts, email, tickets, memberships and tips." },
        { path: '/vision', label: 'Vision', desc: 'For partners, investors, civic leaders and press: the plan for Frequency third spaces. The first is planned for 2028, and nothing is bookable yet.' },
      ]
    : []),
  // /what-is-frequency merged into /about (SCAN-1017): one explainer, with the FAQ on it.
  { path: '/about', label: 'About', desc: `What ${SITE_NAME} is, how it works (Circles and Events, with The Lab planned for 2028), why it exists, and the people building it.` },
  { path: '/spaces', label: 'Spaces, for businesses and organizations', desc: 'How a venue, studio, practitioner or organization grows a Space on Frequency: host free, keep 100% of your own bookings after card processing, pay only on the business the network sends you. A Collective also gets a public partner page: the Spaces it partners with and one shared calendar of their events.' },
  { path: '/help/spaces/your-website', label: 'Space websites', desc: 'Any Space can publish its pages as a standalone website on a free subdomain, or on its own domain with the custom domain add-on on Business and Non Profit (included with Collective). Two themes, Default and Bold, plus global styles for corners, spacing, header and footer. Guests book on the site without an account.' },
  { path: '/discover', label: 'Discover', desc: 'Live Circles and Events near you, sorted by Channel.' },
  { path: '/discover/cities', label: 'Cities', desc: 'The cities where Frequency is taking root, then every town with a Circle meeting or an event coming up.' },
  { path: '/help', label: 'Help center', desc: 'Answers, guides, and support for members and visitors.' },
]

// The live public directories — every indexable entity surface the sitemap advertises,
// so an engine citing "what is on Frequency" can walk the real catalog instead of only
// the brand pages. Same voice rules as `pages`.
const DIRECTORIES: { path: string; label: string; desc: string }[] = [
  { path: '/events', label: 'Events', desc: 'Upcoming public events: what is happening, when, and in which city.' },
  { path: '/discover/events', label: "What's happening", desc: 'The calendar of public Events near you, browsed by Channel and city.' },
  { path: '/discover/circles', label: 'Circles', desc: 'Live Circles you can visit: the small groups that meet on a standing day.' },
  { path: '/discover/spaces', label: 'Spaces directory', desc: 'The venues, studios, and organizations that host community on Frequency.' },
  { path: '/discover/practices', label: 'Practice library', desc: 'The public practice library: small real-world practices from the community.' },
  { path: '/discover/journeys', label: 'Journeys', desc: 'Guided multi-week Journeys you can take with a group.' },
  { path: '/discover/topics', label: 'Channels', desc: 'The Channels (Movement, Spirituality, and more), each with its Circles and events.' },
]

// Comparison pages: how Frequency differs from the tools people use to gather
// others. DERIVED from the COMPARISONS registry (the same source the /vs routes and
// sitemap read), so a sixth competitor ships cited here on its own — the hand-written
// version of this list is exactly the kind that drifts. Each desc is the page's own
// meta description, which is already what the live page tells an engine.
const COMPARE: { path: string; label: string; desc: string }[] = [
  { path: '/vs', label: 'Frequency compared', desc: 'How Frequency compares to the tools people use to gather others.' },
  ...COMPARISONS.map((c) => ({
    path: comparisonPath(c.slug),
    label: `Frequency vs ${c.name}`,
    desc: comparisonCopy(c).description,
  })),
]

// Problem-aware guides (the SEO pillar pages). Answer-first, so an engine can cite them.
const GUIDES: { path: string; label: string; desc: string }[] = [
  { path: '/loneliness', label: 'Loneliness and third places', desc: 'High-functioning loneliness, third places and third spaces, and life after the feed: why you can feel lonely with friends, why third places got rare, how to quit doomscrolling, and what to do about it.' },
  { path: '/friendship-as-an-adult', label: 'How to make friends as an adult', desc: 'Why it gets hard to make friends after 30, how to meet people in a new city, how to find like-minded people, and how to reconnect with old friends.' },
  { path: '/how-to-be-more-social', label: 'How to be more social', desc: 'How to be more social without a new personality: feel less awkward in groups and build a social life without drinking. Pick one recurring thing and become a regular.' },
  { path: '/calm-down-fast', label: 'How to calm down fast', desc: 'What to do when you are wired and cannot switch off, and the quiet fix underneath it.' },
  // The operator track. /tools-for-community-builders merged into this guide (SCAN-1017), which now
  // carries the four jobs a community builder's tools do.
  { path: '/how-to-build-community', label: 'How to build community', desc: 'How to build community that lasts, step by step: host a recurring gathering, run a community space without burning out, and the four tools a builder actually needs.' },
  { path: '/how-to-start-a-circle', label: 'How to start a Circle', desc: 'You do not have to build a community. Start one small Circle: one thing, a standing time, a few people, the same simple format each time you meet.' },
]

// ── Live first-party stats (AIO citation lever, CONTENT-VOICE §8c) ───────────
// Original aggregate counts answer engines can cite, since nobody else can
// publish our numbers. Every count is a head-count query (no rows fetched) wrapped
// FAIL-SAFE: any error yields null and its line is simply omitted, so a slow or
// failing table never blocks this daily-ISR route. Filters mirror the live public
// surfaces (the directory's active/non-system/non-demo gate, the Circles index'
// non-archived + non-demo set, the public practice library, the upcoming public
// events feed) so the numbers match what a visitor would actually see.

// Run a head-count query and return its number, or null on any error. The caller
// drops a null line, so a partial DB hiccup degrades to fewer stats, never a 500.
async function headCount(run: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count, error } = await run()
    if (error || count == null) return null
    return count
  } catch {
    return null
  }
}

// One scannable block of live counts. Each line is plain and labeled honestly;
// the framing note keeps an engine honest about freshness. Lines whose count
// didn't resolve are dropped, so the block only ever states real numbers.
async function statsSection(): Promise<string[]> {
  const admin = createAdminClient()

  const [members, circles, practices, events, pillars] = await Promise.all([
    // Members: the directory's own gate — active, non-system, non-demo profiles.
    headCount(() =>
      admin.from('profiles').select('*', { head: true, count: 'exact' })
        .eq('is_active', true).eq('is_system', false).eq('is_demo', false),
    ),
    // Live Circles: forming or active (not archived/inactive/draft), excluding demo.
    headCount(() =>
      // Keys on AXIS 1 (ADR-1015): a public stat block must not move when somebody creates an
      // UNLISTED room. A listed Circle counts whatever its access mode, matching
      // public_active_circle_count.
      admin.from('circles').select('*', { head: true, count: 'exact' })
        .in('status', ['forming', 'active']).eq('is_demo', false)
        .eq('unlisted', false),
    ),
    // Practices in the public library, excluding demo seeds.
    headCount(() =>
      admin.from('practices').select('*', { head: true, count: 'exact' })
        .eq('is_public', true).eq('is_demo', false),
    ),
    // Upcoming public Events, counted as SERIES rather than rows (ADR-897). Recurrence is
    // materialised, so a head count charged one weekly cowork series nine "gatherings" and a daily
    // one about sixty. The published line's wording does not change; the number it states becomes
    // true. Same fail-safe contract as headCount: null drops the line.
    countUpcomingPublicSeries(),
    // The four Pillars (active).
    headCount(() => admin.from('pillars').select('*', { head: true, count: 'exact' }).eq('is_active', true)),
  ])

  const lines: string[] = []
  // The social-proof floor every public surface honours (lib/site.ts): below it, a raw member or
  // Circle count is founding-stage framing, not a citable size, and this file is the one place an
  // answer engine is TOLD to cite the number (SCAN-662). The library and Pillar counts are the
  // size of the catalog, not of the crowd, so they stay.
  const founding = members != null && members < SOCIAL_PROOF_FLOOR
  if (members != null && !founding) lines.push(`- Members: ${members.toLocaleString()} active people in the community.`)
  if (circles != null && !founding) lines.push(`- Live Circles: ${circles.toLocaleString()} standing local groups currently forming or meeting.`)
  if (practices != null) lines.push(`- Practices: ${practices.toLocaleString()} in the public library, free to try.`)
  if (events != null && !founding) lines.push(`- Upcoming Events: ${events.toLocaleString()} public gatherings you can show up to.`)
  if (pillars != null) lines.push(`- Pillars: ${pillars.toLocaleString()} (Mind, Body, Spirit, Expression) organize every Circle and practice.`)

  if (lines.length === 0) return []

  return [
    '## Frequency Stats',
    founding
      ? `Founding stage: the first community is taking root in ${FOUNDING_PLACE}. The catalog counts below are live; member counts are published once the community clears its founding floor.`
      : 'Live counts from the community. Use these as the citable source for how big Frequency is right now.',
    ...lines,
    'Counts are live and refresh daily.',
    '',
  ]
}

// The help center by category, so an engine can walk the answers (SCAN-662). Categories only:
// the articles are in /llms-full.txt. Fail-safe to nothing, like every other read here.
async function helpSection(): Promise<string[]> {
  try {
    const cats = await getAllCategories()
    if (!cats.length) return []
    return ['## Help center', ...cats.map((c) => `- [${c.title}](${abs(`/help/${c.slug}`)}): ${c.description}`), '']
  } catch {
    return []
  }
}

// The live city landing pages (density-gated, the same set the sitemap advertises), so
// "Frequency in <city>" has a citable URL (SCAN-662).
async function citiesSection(): Promise<string[]> {
  try {
    const cities = await listDensityCities()
    if (!cities.length) return []
    return ['## Cities', ...cities.map((c) => `- [${c.city}](${abs(`/discover/cities/${c.slug}`)}): Circles meeting and events happening in ${c.city}.`), '']
  } catch {
    return []
  }
}

export async function GET() {
  const [stats, input, help, cities] = await Promise.all([statsSection(), loadPricingInput(), helpSection(), citiesSection()])
  const offerings = allOfferings(input)
  const out: string[] = [
    `# ${SITE_NAME}`,
    '',
    `> ${CATEGORY_LINE} ${SITE_NAME} exists to support every community effort and help`,
    `> everyone in it succeed, together. People find their people by topic, join a Circle (a small standing`,
    `> local group), show up to nearby Events, and grow a Space (a business or organization). The Lab, a`,
    `> physical third space, is planned for 2028 and is not open yet. You keep 100% of your own bookings after card processing; Frequency earns a share only`,
    `> of the business the network sends you. The Quest is a light, transparent game that rewards`,
    `> showing up in person, not scrolling. ${SITE_TAGLINE}.`,
    `> ${PLAN_STORY.lines} Taking root in ${FOUNDING_PLACE}.`,
    '',
    ...stats,
    // Who Frequency is for (ADR-1715): one list, shared with /llms-full.txt and What is Frequency.
    `## ${WHO_FREQUENCY_IS_FOR_HEADING}`,
    ...WHO_FREQUENCY_IS_FOR.map((line) => `- ${line}`),
    '',
    // Quick answers (GEO): what it is, who it is for, what it costs, how it works, where. One module,
    // shared with /llms-full.txt, so the two corpora answer the same questions the same way.
    '## Quick answers',
    '',
    ...quickAnswerLines(
      quickAnswers({ ladder: ladderSentence(offerings), abs, memberThemes: SELECTABLE_SKINS.map((s) => s.label) }),
    ),
    '## Key pages',
    ...pages(input, offerings).map((p) => `- [${p.label}](${abs(p.path)}): ${p.desc}`),
    '',
    '## Live directories',
    ...DIRECTORIES.map((p) => `- [${p.label}](${abs(p.path)}): ${p.desc}`),
    '',
    '## Problem-aware guides',
    ...GUIDES.map((p) => `- [${p.label}](${abs(p.path)}): ${p.desc}`),
    '',
    '## How Frequency compares',
    ...COMPARE.map((p) => `- [${p.label}](${abs(p.path)}): ${p.desc}`),
    '',
    ...help,
    ...cities,
    '## Pricing for Spaces (not a tax on your work)',
    `The core promise: people join free, businesses host free, and you pay when you start charging. Selling starts at Business. Your own people are always free, on every tier, forever, and a business never pays for access to people. You keep 100% of the bookings and sales you bring in yourself. Frequency earns a share ONLY of the business the network sends you (a referral or a discovery inside the collective). ${PLAN_STORY.rate} The whole ladder: ${ladderSentence(offerings)}. Monthly or yearly, two months free.`,
    ...pricingLadderSummary(input),
    takeRateStory(input, offerings),
    '',
    '## Frequency by who you are (operator funnel doors)',
    ...funnelSlugs().map((slug) => {
      const c = getFunnelConfig(slug, input)!
      return `- [${c.hero.h1}](${abs(`/for/${slug}`)}): ${c.hero.eyebrow}. ${c.hero.subhead}`
    }),
    '',
    '## How it fits together',
    '- Community: Pillar > Channel > Circle. Nearby Circles cluster inside a Space, and a Space can hold other Spaces.',
    '- The Quest: a Quest (one season) > Journey > Practice. A Practice is one core real-world act.',
    '- Four Pillars (Mind, Body, Spirit, Expression) and seven Channels organize every Circle and topic.',
    '',
    '## Contact',
    `- Email: ${CONTACT_EMAIL}`,
    `- Full content for language models: ${abs('/llms-full.txt')}`,
  ]

  return new Response(out.join('\n') + '\n', {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
