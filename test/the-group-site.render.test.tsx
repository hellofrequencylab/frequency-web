import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { SiteChrome } from '@/components/sites/site-chrome'
import { MensworkPage } from '@/components/sites/menswork-page'
import { planMensworkPage, type MwBlock } from '@/lib/sites/menswork-page'
import type { MwLive } from '@/lib/sites/menswork-data'
import type { SiteLinkMap } from '@/lib/sites/house-theme'
import { BlockRender } from '@/lib/page-editor/block-render'
import { config } from '@/lib/page-editor/config'
import { networkAccentVars, networkScheme, type NetworkSchemeId } from '@/lib/theme/network'
import { mensworkSeason } from '@/lib/theme/menswork'
import { NETWORK_CSS } from '@/components/sites/network-css'
import { readSiteFooter, siteFooterFor } from '@/lib/sites/site-footer'
import { expandSiteSeries, type SiteEventRow } from '@/lib/sites/site-events'
import { BRAND, CHAPTERS, LOGO, MERCH, PAGES, SLUG, TAGLINE, TIERS, buildChapterDoc, buildEvents, buildPageDocs, buildPreferences, chapterSlug, ptIso } from '../scripts/seed-the-group.mts'

// THE GROUP'S SITE, RENDERED OFFLINE. The live site is the seed's page docs drawn by the same chrome and
// section renderer the Next page uses (components/sites/site-page.tsx) on the Network theme. Next's page
// needs the database and next/font, so this renders the SAME tree one level down: SiteChrome around
// MensworkPage, the Network blocks drawn by BlockRender with the seed's events in metadata. With
// THE_GROUP_SHOTS_DIR set it writes each page as a static HTML file for screenshots beside the handoff.

const NOW = new Date(Date.UTC(2026, 9, 13, 15))
const ORIGIN = 'https://frequency.example'
const TZ = 'America/Los_Angeles'

const pageDocs = buildPageDocs() as Record<string, { content: MwBlock[] }>
const events = buildEvents()

const stored: (SiteEventRow & { description: string; location: string })[] = events.map((e, i) => ({
  id: `evt-${i}`,
  slug: e.slug,
  title: e.title,
  description: e.description,
  location: e.location,
  startsAt: ptIso(e.date, e.start),
  endsAt: ptIso(e.date, e.end),
  timeZone: TZ,
  recurrenceType: e.rule ? 'weekly' : null,
  recurrenceRule: e.rule,
  recurrenceUntil: null,
  parentEventId: null,
  isCancelled: false,
}))

/** The seed's rows as the upcoming list the Space blocks read (every series expanded, soonest first). */
const upcoming = expandSiteSeries(stored, { through: new Date(Date.UTC(2027, 0, 31)), from: new Date(Date.UTC(2026, 9, 13)) })
  .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  .map((e) => ({ ...e, timeZone: TZ, location: stored.find((s) => s.slug === e.slug || e.slug?.startsWith(`${s.slug}-`))?.location ?? null }))

const live: MwLive = {
  events: upcoming.map((e) => ({ id: e.id, slug: e.slug ?? e.id, title: e.title, description: null, startsAt: e.startsAt, endsAt: e.endsAt ?? null, location: e.location ?? null })),
  circles: [],
  journeys: [],
}

const links: SiteLinkMap = { origin: ORIGIN, slug: SLUG, siteBase: '', pages: PAGES.map((p) => p.slug), contactHref: '/contact', bookHref: null, email: null }
const footer = siteFooterFor(readSiteFooter(buildPreferences()), links, ORIGIN)
const metadata = { space: { identity: { name: BRAND, logoUrl: LOGO }, slug: SLUG, tagline: TAGLINE, logoUrl: LOGO, events: upcoming }, links }
const menu = PAGES.filter((p) => p.slug !== 'home').map((p) => ({ href: `/${p.slug}`, label: p.label }))

export function renderPage(slug: string, scheme: NetworkSchemeId = 'marigold', chapter?: string): string {
  const doc = chapter ? (buildChapterDoc(CHAPTERS.find((c) => c.key === chapter)!) as { content: MwBlock[] }) : pageDocs[slug]
  const blocks = (doc?.content ?? []).map((b) => ({ type: b.type, props: b.props ?? {} }))
  const plan = planMensworkPage(blocks)
  const accent = scheme === 'marigold' ? null : { ocean: '#1F6FA8', lagoon: '#22796E', coral: '#EE7655' }[scheme]
  const page = (
    <SiteChrome
      brandName="The Group"
      homeHref="/"
      links={menu}
      cta={{ href: '/fridays', label: 'Join a Group', external: false }}
      themeFonts
      skin={{ theme: 'network', season: mensworkSeason(NOW), scheme: networkScheme(accent) }}
      logoUrl={LOGO}
      logoMode="avatar"
      tagline={TAGLINE}
      showBrandFooter
      footer={footer}
    >
      <MensworkPage
        blocks={blocks}
        plan={plan}
        live={live}
        links={links}
        origin={ORIGIN}
        pageTitle={PAGES.find((p) => p.slug === slug)?.label ?? 'The Group'}
        now={NOW}
        renderOther={(b) => <BlockRender config={config} data={{ root: {}, content: [b] }} metadata={metadata} />}
      />
    </SiteChrome>
  )
  const vars = Object.entries(networkAccentVars(accent)).map(([k, v]) => `${k}:${v}`).join(';')
  return renderToStaticMarkup(
    <div style={{ ['--font-nw-bricolage' as string]: "'Bricolage Grotesque'", ['--font-nw-outfit' as string]: "'Outfit'", ['--font-nw-instrument' as string]: "'Instrument Serif'", ['--font-caveat' as string]: "'Caveat'" }} data-harness-vars={vars}>
      {page}
    </div>,
  )
}

const HEAD = (title: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700..800&family=Outfit:wght@300..700&family=Instrument+Serif:ital@0;1&family=Caveat:wght@600;700&display=swap" rel="stylesheet">
<style>html,body{margin:0}body{font-family:system-ui,sans-serif}*{box-sizing:border-box}img{max-width:100%}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.hidden{display:none}@media (min-width:768px){.md\\:block{display:block}.md\\:hidden{display:none}}</style></head><body>`

function writeShot(dir: string, name: string, html: string) {
  const vars = /data-harness-vars="([^"]*)"/.exec(html)?.[1] ?? ''
  // One style attribute: the accent vars join the font vars the wrapper already carries.
  const page = html.replace(/ style="([^"]*)" data-harness-vars="[^"]*"/, (_, fonts: string) => ` style="${fonts};${vars}"`)
  // Every photo loads at once in the screenshot (a full-page shot never scrolls a lazy image into view).
  writeFileSync(join(dir, `${name}.html`), `${HEAD(`${name} · The Group`)}${page.replace(/ loading="lazy"/g, '')}</body></html>`)
}

function words(html: string): string {
  const text = html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ')
  return text.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
}

describe("The Group's site, rendered from the seed through the real chrome and sections", () => {
  const out = process.env.THE_GROUP_SHOTS_DIR
  if (out) mkdirSync(out, { recursive: true })

  it.each(PAGES.map((p) => p.slug))('renders %s on the Network theme with every seeded section', (slug) => {
    const html = renderPage(slug)
    if (out) writeShot(out, slug, html)
    expect(html).toContain('data-house-theme="network"')
    expect(html).toContain('data-scheme="marigold"')
    expect(html).toContain(NETWORK_CSS.slice(0, 60))
    expect(html).toContain('<h1')
    expect(html).not.toMatch(/—/)
    expect(words(html)).toContain('Powered by Frequency')
  })

  it('writes the four schemes and each chapter home for the screenshots', () => {
    for (const scheme of ['ocean', 'lagoon', 'coral'] as const) {
      const html = renderPage('home', scheme)
      expect(html).toContain(`data-scheme="${scheme}"`)
      if (out) writeShot(out, `home-${scheme}`, html)
    }
    for (const c of CHAPTERS) {
      const html = renderPage('home', 'marigold', c.key)
      expect(words(html)).toContain(c.short)
      if (out) writeShot(out, `chapter-${chapterSlug(c)}`, html)
    }
  })

  it("draws Home in the handoff's order with the brief's words and the Space's own dates", () => {
    const home = words(renderPage('home'))
    const order = ['The non', '8,500+', 'Start your Friday', 'Bring your idea', 'Find a group.', 'Your first Friday', 'Pockets of community', 'Find the people', 'Meet June An, founder', 'June, Carol', 'Your journey', 'Your story deserves a studio', 'The podcast.', 'Connect with us', 'Made with local', "The Group's golden rule."]
    let at = 0
    for (const s of order) {
      const i = home.indexOf(s, at)
      expect(i, s).toBeGreaterThanOrEqual(at)
      at = i
    }
    // The hero's "This Friday" card is the next Feel Good Friday, Oct 16 at 9:00.
    expect(home).toContain('FRI 16 Feel Good Friday 9:00–10:10 AM · June An & Carol Yeh-Garner')
    expect(home).toContain('300+ weekly attendees')
    expect(home).toContain('100,000+ monthly profile views')
    for (const t of TIERS) expect(home).toContain(t.name)
    for (const m of MERCH) expect(home).toContain(m.short)
    expect(home).toContain('$19.99')
    expect(home).toContain('Most members')
    expect(home).toContain('June@thegroupcoastal.com')
    expect(home).toContain('858-997-5951')
  })
})
