import { getAllCategories, helpHref } from '@/lib/help/content'
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION, SITE_TAGLINE, CONTACT_EMAIL, FOUNDING_PLACE } from '@/lib/site'
import { PRICING_DEFAULTS } from '@/lib/pricing/settings'
import { pricingTiers, tierHeadline, tierListAnchor } from '@/lib/pricing/pricing-page'

// /llms-full.txt — the comprehensive, self-maintaining companion to the curated /llms.txt route
// (AIO, docs/CONTENT-VOICE §8). Where llms.txt is a hand-written brand summary, this dumps the
// full help-center content (every published article's title, URL, description, and body) so AI
// answer engines can ingest the real product documentation, ATOP a canonical "About Frequency"
// header that states the Community Collective positioning, the honest-money model, the four brand
// promises, and the live tier ladder (prices read from the CODE catalog, so they never drift, and
// the beta-window anchors auto-revert on cutover). Generated at request time (ISR), never stale.
// Public, non-sensitive, server-rendered text. No em dashes (CONTENT-VOICE punctuation rule).

export const revalidate = 3600

/** Whole-dollar string for a cents amount ($9, $29), the register the tier ladder reads in. */
const usd = (cents: number) => `$${Math.round(cents / 100)}`

/** The tier-ladder lines, priced from the code catalog (pricingTiers is PURE + framework-free), so the
 *  ladder here matches the /pricing table exactly and the beta anchors revert on the same cutover. Member
 *  and Crew are the two personal tiers (not space tiers), so they are stated from their own catalog rows. */
function tierLadderLines(): string[] {
  const crew = PRICING_DEFAULTS.tier.crew
  const lines: string[] = [
    `- Member: free. Join, show up to a Circle or Event, and use the community. You keep 100% of your own bookings.`,
    `- Crew: ${usd(crew.monthly_cents)} a month${
      crew.list_cents ? ` (under a ${usd(crew.list_cents)} list)` : ''
    }. The personal tier for individuals: participation and leadership training tracks.`,
  ]
  for (const t of pricingTiers()) {
    const price = tierHeadline(t, 'month')
    const anchor = tierListAnchor(t, 'month')
    lines.push(
      `- ${t.name}: ${price}${anchor ? ` (list ${anchor})` : ''}. ${t.forWho} Take-rate: ${t.takeRate}.`,
    )
  }
  return lines
}

export async function GET() {
  const cats = await getAllCategories()

  // Network-sourced take-rate ladder (the shrinking, network-only fee), read from the code catalog.
  const net = PRICING_DEFAULTS.take_rate.network_bps
  const pct = (bps: number) => `${bps / 100}%`

  const out: string[] = [
    `# ${SITE_NAME}: full content for language models`,
    '',
    `> ${SITE_DESCRIPTION} ${SITE_TAGLINE}. Taking root in ${FOUNDING_PLACE}. Contact: ${CONTACT_EMAIL}.`,
    '',
    `Curated short version: ${SITE_URL}/llms.txt`,
    '',
    '## About Frequency',
    '',
    'Frequency is a Community Collective. We exist to support every community effort and help everyone in it succeed, together. Everything a community needs sits in one place: start a Circle, host Events near you, run The Quest, and grow a Space (your own community, business, or nonprofit).',
    '',
    '### The honest-money model',
    '',
    'You keep 100% of your own bookings, always. We earn only a small, shrinking take-rate on the business the network sends you, never on what you bring in yourself. That network-only rate drops as your plan rises:',
    `- Member: ${pct(net.free)} on network-sourced sales.`,
    `- Business: ${pct(net.business)} on network-sourced sales.`,
    `- Collective: ${pct(net.collective)} on network-sourced sales.`,
    `- Non Profit: ${pct(net.nonprofit)}, always.`,
    `- Independent: ${pct(net.independent)}. Standalone, off the network.`,
    '',
    'Physical Spaces (Outposts and Frequency Labs) are funded by a separate community-owned vehicle, never out of platform margin.',
    '',
    '### The four promises',
    '',
    '1. We never take a cut of your own bookings.',
    '2. One honest price, no surprise invoices.',
    '3. Month to month. Take your data and leave anytime.',
    '4. See exactly what the network earned you.',
    '',
    '### The tier ladder',
    '',
    ...tierLadderLines(),
    '',
    `Full pricing: ${SITE_URL}/pricing`,
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
      if (a.description) out.push(a.description)
      out.push('', a.body.trim())
    }
  }

  return new Response(out.join('\n') + '\n', {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
