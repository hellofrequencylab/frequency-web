import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { SiteChrome } from '@/components/sites/site-chrome'
import { MensworkPage } from '@/components/sites/menswork-page'
import { planMensworkPage, type MwBlock } from '@/lib/sites/menswork-page'
import type { MwLive } from '@/lib/sites/menswork-data'
import type { SiteLinkMap } from '@/lib/sites/house-theme'
import { BlockRender } from '@/lib/page-editor/block-render'
import { config } from '@/lib/page-editor/config'
import { wildheartAccentVars } from '@/lib/theme/wildheart'
import { seasonOf } from '@/lib/theme/astrology-wheel'
import { WILDHEART_CSS } from '@/components/sites/wildheart-css'
import { readSiteFooter, siteFooterFor } from '@/lib/sites/site-footer'
import { buildEvents, buildItems, buildPageDocs, buildPreferences, ptIso, CIRCLE, CIRCLES_MORE, FOUNDATION, PAGES, SLUG, TAGLINE, YEAR } from '../scripts/seed-wildheart.mts'
import { expandSiteSeries, type SiteEventRow } from '@/lib/sites/site-events'

// The handoff draws the site as its admin sees it (the Vision and Calendar chip). Since SCAN-970 the admin
// links are a client island that shows only once the site's check confirms an admin, so this render stands
// in that confirmed answer.
vi.mock('@/components/sites/site-admin-gate', () => ({
  useSiteAdmin: () => true,
  SiteAdminOnly: ({ children }: { children: React.ReactNode }) => children,
}))

// THE WILDHEART SITE, RENDERED OFFLINE (LIVE-903, LIVE-904). The live site is the seed's page docs drawn by
// the same chrome and section renderer the Next page uses (components/sites/site-page.tsx), with the
// Space's own rows. Next's page itself needs the database (getSiteSpace) and next/font, so this test
// renders the SAME tree one level down: SiteChrome around MensworkPage, blocks the theme does not plan
// drawn by BlockRender with the Space's events in metadata, the seed's events, circles and journeys as
// the live rows (shaped like the handoff's placeholders where the rows are the handoff's: four circles
// with its seat counts). It measures the consequences the handoff names, holds every handoff string on
// the six pages (scripts/probes/wildheart-content-checklist.json) and, with WILDHEART_SHOTS_DIR set,
// writes each page as a static HTML file for scripts/probes/wildheart-shots.mjs to screenshot.

const NOW = new Date(Date.UTC(2026, 9, 12, 20))
const ORIGIN = 'https://frequency.example'
const SITE_BASE = ''

const pageDocs = buildPageDocs() as Record<string, { content: MwBlock[] }>
const events = buildEvents()
const items = buildItems()

const TZ = 'America/Los_Angeles'

/** The seed's rows as the database holds them (lib/time/zone.ts): the wall clock as UTC parts beside the
 *  Space's zone, the Circle Night anchor with its rule. */
const storedRows: (SiteEventRow & { description: string })[] = events.map((e, i) => ({
  id: `evt-${i}`,
  slug: e.slug,
  title: e.title,
  description: e.description,
  startsAt: ptIso(e.date, e.start),
  endsAt: ptIso(e.endDate ?? e.date, e.end),
  timeZone: TZ,
  recurrenceType: e.recurrence?.type ?? null,
  recurrenceRule: e.recurrence?.rule ?? null,
  recurrenceUntil: null,
  parentEventId: null,
  isCancelled: false,
}))

/** The seed's events as the live rows a page reads (lib/sites/menswork-data.ts readEvents): every anchor
 *  expanded through next year, soonest first from today. */
function liveEvents(): MwLive['events'] {
  const floor = new Date(Date.UTC(2026, 9, 12))
  return expandSiteSeries(storedRows, { through: new Date(Date.UTC(2027, 11, 31, 23, 59, 59)), from: floor })
    .filter((e) => new Date(e.startsAt).getTime() >= floor.getTime())
    .map((e) => ({ id: e.id, slug: e.slug ?? e.id, title: e.title, description: e.description, startsAt: e.startsAt, endsAt: e.endsAt ?? null, location: null }))
}

function liveJourneys(): MwLive['journeys'] {
  return [FOUNDATION, YEAR].map((j) => {
    const plan = j === FOUNDATION ? 'foundation' : 'year'
    const phases = items
      .filter((it) => it.plan === plan && it.block_type === 'phase')
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ph) => ({
        title: ph.title,
        body: ph.body,
        steps: items
          .filter((it) => it.plan === plan && it.block_type === 'module' && it.parent_id === ph.id)
          .map((m) => m.title),
      }))
    return { id: j.id, slug: j.slug, title: j.title, summary: j.summary, coverImage: null, phases }
  })
}

/** The four circles: the seed's rows, with the handoff's seat counts and hosts standing in for the live
 *  counts (the handoff's host names are placeholders; the real rows carry the real host). */
const SEATS: Record<string, { members: number; host: string }> = { 'wildheart-primary-circle': { members: 9, host: 'founding lead' }, 'wildheart-eastside': { members: 11, host: 'trained' }, 'wildheart-foothills': { members: 12, host: 'trained' }, 'wildheart-riverside': { members: 4, host: 'in training' } }

const live: MwLive = {
  events: liveEvents(),
  circles: [
    { id: 'circle-1', slug: CIRCLE.slug, name: CIRCLE.name, about: CIRCLE.about, memberCount: SEATS[CIRCLE.slug].members, memberCap: CIRCLE.memberCap, status: 'active', imageUrl: null, neighborhood: CIRCLE.neighborhood, meets: CIRCLE.meetup.text, host: SEATS[CIRCLE.slug].host, hostAvatar: null, isSpacePrimary: true },
    ...CIRCLES_MORE.map((c) => ({ id: c.id, slug: c.slug, name: c.name, about: c.about, memberCount: SEATS[c.slug].members, memberCap: CIRCLE.memberCap, status: c.status, imageUrl: null, neighborhood: c.neighborhood, meets: c.meetup.text, host: SEATS[c.slug].host, hostAvatar: null, isSpacePrimary: false })),
  ],
  journeys: liveJourneys(),
}

const links: SiteLinkMap = { origin: ORIGIN, slug: SLUG, siteBase: SITE_BASE, pages: PAGES.map((p) => p.slug), contactHref: '/contact', bookHref: null, email: null }
const footer = siteFooterFor(readSiteFooter(buildPreferences()), links, ORIGIN)

/** The Space's own rows the blocks the theme does not plan read through `puck.metadata.space`. */
const metadata = {
  space: {
    // The live render's website content carries the name under `identity` (lib/spaces/content-data.ts).
    identity: { name: 'Wildheart', logoUrl: '/brand/wildheart/wildheart-logo.svg' },
    slug: SLUG,
    tagline: TAGLINE,
    logoUrl: '/brand/wildheart/wildheart-logo.svg',
    // The landing's channel (components/spaces/space-landing.tsx): the upcoming rows as stored and the live
    // series rows; the Wildheart block expands the series itself.
    events: storedRows.filter((e) => new Date(e.startsAt).getTime() >= Date.UTC(2026, 9, 12)),
    series: storedRows.filter((e) => e.recurrenceType && e.recurrenceType !== 'none'),
  },
  links,
}

const menu = PAGES.map((p) => ({ href: p.slug === 'home' ? '/' : `/${p.slug}`, label: p.label }))
const next = live.events.find((e) => /circle night/i.test(e.title)) ?? live.events[0] ?? null

export function renderPage(slug: string): string {
  const doc = pageDocs[slug]
  const blocks = (doc?.content ?? []).map((b) => ({ type: b.type, props: b.props ?? {} }))
  const plan = planMensworkPage(blocks)
  const page = (
    <SiteChrome
      brandName="Wildheart"
      homeHref="/"
      links={menu}
      cta={{ href: '/circles', label: 'Come to one Circle Night', external: false }}
      themeFonts
      skin={{ theme: 'wildheart', season: seasonOf(NOW) }}
      logoUrl={metadata.space.logoUrl}
      logoMode="name"
      tagline={TAGLINE}
      showBrandFooter
      footer={footer}
      seasonNow={next ? { module: next.title, theme: null, next: next.startsAt } : null}
      admin={{ menu: [{ href: '/admin/overview', label: 'Vision' }, { href: '/admin/calendar', label: 'Calendar' }], console: `${ORIGIN}/spaces/${SLUG}/manage/leadership` }}
    >
      <MensworkPage
        blocks={blocks}
        plan={plan}
        live={live}
        links={links}
        origin={ORIGIN}
        pageTitle={PAGES.find((p) => p.slug === slug)?.label ?? 'Wildheart'}
        now={NOW}
        renderOther={(b) => <BlockRender config={config} data={{ root: {}, content: [b] }} metadata={metadata} />}
      />
    </SiteChrome>
  )
  const vars = Object.entries(wildheartAccentVars(null) ?? {}).map(([k, v]) => `${k}:${v}`).join(';')
  return renderToStaticMarkup(
    <div style={{ ['--font-wh-fell' as string]: "'IM Fell English'", ['--font-wh-garamond' as string]: "'EB Garamond'", ['--font-wh-hanken' as string]: "'Hanken Grotesk'", ['--font-wh-symbols' as string]: "'Noto Sans Symbols'" }} data-harness-vars={vars}>
      {page}
    </div>,
  )
}

const HEAD = (title: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Hanken+Grotesk:wght@400;500;600&family=Noto+Sans+Symbols:wght@300;400&display=swap" rel="stylesheet">
<style>@font-face{font-family:'IM Fell English';src:url(/fonts/wildheart/IMFellEnglish-Regular.ttf);font-weight:400;font-style:normal}@font-face{font-family:'IM Fell English';src:url(/fonts/wildheart/IMFellEnglish-Italic.ttf);font-weight:400;font-style:italic}
html,body{margin:0}body{font-family:system-ui,sans-serif}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.hidden{display:none}@media (min-width:768px){.md\\:block{display:block}.md\\:hidden{display:none}}</style></head><body>`

function writeShot(dir: string, slug: string, html: string) {
  const vars = /data-harness-vars="([^"]*)"/.exec(html)?.[1] ?? ''
  const page = html.replace(/ data-harness-vars="[^"]*"/, ` style="${vars}"`)
  writeFileSync(join(dir, `${slug}.html`), `${HEAD(`${PAGES.find((p) => p.slug === slug)?.label ?? 'Wildheart'} · Wildheart`)}${page}</body></html>`)
}

/** The words a page shows: its text and the alt, aria-label and title attributes, whitespace folded. */
function words(html: string): string {
  const attrs = [...html.matchAll(/\b(?:alt|aria-label|title)="([^"]*)"/g)].map((m) => m[1])
  const text = html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, (svg) => svg.replace(/<[^>]+>/g, ' ')).replace(/<[^>]+>/g, ' ')
  return [text, ...attrs].join(' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
}

describe('the Wildheart site, rendered from the seed through the real chrome and sections', () => {
  const out = process.env.WILDHEART_SHOTS_DIR
  if (out) mkdirSync(join(out, 'site'), { recursive: true })

  it.each(PAGES.map((p) => p.slug))('renders %s with the Wildheart skin, the fixed header, the date line, and every seeded block', (slug) => {
    const html = renderPage(slug)
    if (out) writeShot(join(out, 'site'), slug, html)
    expect(html).toContain('data-house-theme="wildheart"')
    expect(html).toContain('class="wh-fixed"')
    expect(html).toContain('class="wh-fixed-spacer"')
    expect(html).toContain('wh-nowline')
    expect(html).toContain('<h1')
    expect(html).toContain('Next Circle Night')
    // The handoff's footer: three columns, the ornament, the copyright with its suffix and the closing line.
    for (const s of ['The program', 'Circles', 'On Frequency', 'The Wildheart Space', 'Hearth Gatherings', 'A program on Frequency', 'What is shared stays here']) expect(html).toContain(s)
    expect(html).toContain('hs-footer-top" data-columns=""')
    // The skin travels with the page, so the file stands alone.
    expect(html).toContain(WILDHEART_CSS.slice(0, 60))
    expect(html).not.toMatch(/—/)
  })

  it("draws the Space's own rows: the next Circle Night, the four circles with their seats, and the foundation's weeks", () => {
    const home = renderPage('home')
    expect(home).toContain('Next Circle Night')
    // The live bug (LIVE-905): the stored 2026-11-03T18:00Z (the wall clock as UTC parts) reads Tue Nov 3 at 6:00 PM.
    expect(words(home)).toContain('Next Circle Night Tue Nov 3 · 6:00 PM')
    expect(words(home)).not.toContain('2:00 AM')
    expect(words(home)).toContain("Hunter's Moon")
    const circles = renderPage('circles')
    for (const c of [CIRCLE, ...CIRCLES_MORE]) expect(circles).toContain(c.name)
    expect(circles).toContain('12 women · host')
    expect(circles).toContain('mw-badge-full')
    expect(circles).toContain('mw-badge-forming')
    const program = renderPage('program')
    expect(program).toContain('Week 1')
    expect(words(program)).toContain('Jan 5')
    expect(words(program)).not.toContain('Jan 6')
    expect(program).toContain('Breath and noticing what the body feels, not how it looks')
    expect(program).not.toContain(YEAR.title)
  })

  it('puts every Circle Night of the year on the wheel and in the season-headed list (LIVE-905)', () => {
    const home = renderPage('home')
    // The pinned wheel: a dot per Circle Night through 2027 (the anchor's rule, not the four stored children).
    const circleDots = home.match(/data-kind="circle"/g) ?? []
    expect(circleDots.length).toBeGreaterThanOrEqual(26)
    expect(home).toContain('Circle Night · Jan 12')
    expect(home).toContain('Circle Night · Dec 28')
    // The journey opens in winter, in January, whatever today is.
    expect(home).toMatch(/wh-block wh-block-journey[^"]*" data-season="winter"/)
    expect(home).toContain('The year opens')
    // The phone's sky map and The year's: the list in season sections headed by the season and its modules.
    const year = renderPage('the-year')
    expect(year).toContain('wh-sm-season-head')
    expect(words(year)).toContain('Winter · Rest and root')
    expect(words(year)).toContain('Spring · Rise')
    expect((year.match(/>Circle Night</g) ?? []).length).toBeGreaterThanOrEqual(26)
    expect(words(year)).toContain('Tue · 6:00 PM')
  })

  it('carries every string of the handoff template on the six pages (the content checklist)', () => {
    const checklist = JSON.parse(readFileSync(join(process.cwd(), 'scripts/probes/wildheart-content-checklist.json'), 'utf8')) as { screens: Record<string, string[]>; exceptions: { text: string }[] }
    const all = PAGES.map((p) => words(renderPage(p.slug))).join(' ')
    const except = new Set(checklist.exceptions.map((e) => e.text))
    const missing: string[] = []
    for (const [screen, list] of Object.entries(checklist.screens)) for (const s of list) if (!except.has(s) && !all.includes(s)) missing.push(`${screen}: ${s}`)
    expect(missing).toEqual([])
  })
})
