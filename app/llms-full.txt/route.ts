import { getAllCategories, helpHref } from '@/lib/help/content'
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION, SITE_TAGLINE, CONTACT_EMAIL, FOUNDING_PLACE } from '@/lib/site'
import { getPricingValues } from '@/lib/pricing/settings'
import { catalogConfigByKey, loadCatalogConfig } from '@/lib/pricing/catalog-config'
import { isBetaPricingActive } from '@/lib/pricing/beta'
import { allOfferings, type Offering, type PricingGridInput } from '@/lib/pricing/pricing-grid'
import { offeringLadderLabel } from '@/lib/pricing/pricing-page'

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

/** Resolve the whole pricing model the way /pricing does: the operator's editable config layered over
 *  the code defaults. This route already reads the DB (the help center) and is ISR, so it can afford the
 *  same reads /pricing makes, and an edit at /admin/pricing now moves the answer-engine corpus in the
 *  same revalidation it moves the page. Before Phase 5 (ADR-916) it read the code defaults only, so a
 *  price or rate an operator changed was published here at the old number until the next deploy. */
async function pricingInput(): Promise<PricingGridInput> {
  const [values, catalog] = await Promise.all([getPricingValues(), loadCatalogConfig()])
  return { values, catalog: catalogConfigByKey(catalog), betaActive: isBetaPricingActive() }
}

/** The network-only take-rate, one line per rung, straight off the offerings. Every rung is listed, so
 *  the ladder cannot silently omit one the way a hand-written list did (it named Member, Business,
 *  Collective, and Non Profit, and left out Crew, the free Space, and Independent). */
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

export async function GET() {
  const [cats, input] = await Promise.all([getAllCategories(), pricingInput()])
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
    'Frequency is a Community Collective. We exist to support every community effort and help everyone in it succeed, together. Everything a community needs sits in one place: start a Circle, host Events near you, run The Quest, and grow a Space (your own community, business, or nonprofit).',
    '',
    '### The honest-money model',
    '',
    'Selling is free on every tier. A free Member and a free Space can sell tickets and take payments and donations from day one; a paid plan buys a lower rate, not permission. You keep 100% of your own bookings, always, and tips carry no fee on any rung. We earn only a small, shrinking take-rate on the business the network sends you, never on what you bring in yourself. That network-only rate drops as your plan rises:',
    ...takeRateLines(offerings),
    '',
    'Three capabilities need a paid plan, and nothing else does: selling memberships (Business), campaigns and funnels (Business), and revenue splits (Collective). Everything else is a meter with a real free allowance, and a full meter stops new writes without ever hiding, deleting, or locking what is already there.',
    '',
    'Physical Spaces (Outposts and Frequency Labs) are funded by a separate community-owned vehicle, never out of platform margin.',
    '',
    '### The four promises',
    '',
    '1. We never take a cut of your own bookings, and we never gate the transaction.',
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
