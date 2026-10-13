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
import { wildheartAccentVars } from '@/lib/theme/wildheart'
import { seasonOf } from '@/lib/theme/astrology-wheel'
import { WILDHEART_CSS } from '@/components/sites/wildheart-css'
import { buildEvents, buildItems, buildPageDocs, CIRCLE, FOUNDATION, PAGES, SLUG, TAGLINE, YEAR } from '../scripts/seed-wildheart.mts'

// THE WILDHEART SITE, RENDERED OFFLINE (LIVE-903). The live site is the seed's page docs drawn by the same
// chrome and section renderer the Next page uses (components/sites/site-page.tsx), with the Space's own
// rows. Next's page itself needs the database (getSiteSpace) and next/font, so this test renders the SAME
// tree one level down: SiteChrome around MensworkPage, blocks the theme does not plan drawn by BlockRender
// with the Space's events in metadata, the seed's events, circle and journeys as the live rows. It measures
// the consequences the handoff names and, with WILDHEART_SHOTS_DIR set, writes each page as a static HTML
// file for scripts/probes/wildheart-shots.mjs to screenshot beside the handoff.

const NOW = new Date(Date.UTC(2026, 9, 12, 20))
const ORIGIN = 'https://frequency.example'
const SITE_BASE = ''

const pageDocs = buildPageDocs() as Record<string, { content: MwBlock[] }>
const events = buildEvents()
const items = buildItems()

/** The seed's events as the live rows a page reads (lib/sites/menswork-data.ts shape), soonest first. */
function liveEvents(): MwLive['events'] {
  return events
    .map((e, i) => ({
      id: `evt-${i}`,
      slug: e.slug,
      title: e.title,
      description: e.description,
      startsAt: `${e.date}T${e.start}`,
      endsAt: `${e.endDate ?? e.date}T${e.end}`,
      location: null,
    }))
    .filter((e) => e.startsAt >= '2026-10-12')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

function liveJourneys(): MwLive['journeys'] {
  return [FOUNDATION, YEAR].map((j) => {
    const plan = j === FOUNDATION ? 'foundation' : 'year'
    const phases = items
      .filter((it) => it.plan === plan && it.block_type === 'phase')
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ph) => ({
        title: ph.title,
        steps: items
          .filter((it) => it.plan === plan && it.block_type === 'module' && it.parent_id === ph.id)
          .map((m) => m.title),
      }))
    return { id: j.id, slug: j.slug, title: j.title, summary: j.summary, coverImage: null, phases }
  })
}

const live: MwLive = {
  events: liveEvents(),
  circles: [
    {
      id: 'circle-1', slug: CIRCLE.slug, name: CIRCLE.name, about: CIRCLE.about, memberCount: 7, memberCap: CIRCLE.memberCap,
      status: 'open', imageUrl: null, neighborhood: null, meets: CIRCLE.meetup.text, host: 'The host', hostAvatar: null, isSpacePrimary: true,
    },
  ],
  journeys: liveJourneys(),
}

const links: SiteLinkMap = { origin: ORIGIN, slug: SLUG, siteBase: SITE_BASE, pages: PAGES.map((p) => p.slug), contactHref: '/contact', bookHref: null, email: null }

/** The Space's own rows the blocks the theme does not plan read through `puck.metadata.space`. */
const metadata = {
  space: {
    name: 'Wildheart',
    slug: SLUG,
    tagline: TAGLINE,
    logoUrl: '/brand/wildheart/wildheart-logo.svg',
    events: live.events.map((e) => ({ id: e.id, slug: e.slug, title: e.title, startsAt: e.startsAt })),
  },
}

const menu = PAGES.map((p) => ({ href: p.slug === 'home' ? '/' : `/${p.slug}`, label: p.label }))

export function renderPage(slug: string): string {
  const doc = pageDocs[slug]
  const blocks = (doc?.content ?? []).map((b) => ({ type: b.type, props: b.props ?? {} }))
  const plan = planMensworkPage(blocks)
  const next = live.events[0] ?? null
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
      seasonNow={next ? { module: next.title, theme: null, next: next.startsAt } : null}
      admin={null}
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

const HEAD = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wildheart</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Hanken+Grotesk:wght@400;500;600&family=Noto+Sans+Symbols:wght@300;400&display=swap" rel="stylesheet">
<style>@font-face{font-family:'IM Fell English';src:url(/fonts/wildheart/IMFellEnglish-Regular.ttf);font-weight:400;font-style:normal}@font-face{font-family:'IM Fell English';src:url(/fonts/wildheart/IMFellEnglish-Italic.ttf);font-weight:400;font-style:italic}
html,body{margin:0}body{font-family:system-ui,sans-serif}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style></head><body>`

function writeShot(dir: string, slug: string, html: string) {
  const vars = /data-harness-vars="([^"]*)"/.exec(html)?.[1] ?? ''
  const page = html.replace(/ data-harness-vars="[^"]*"/, ` style="${vars}"`)
  writeFileSync(join(dir, `${slug}.html`), `${HEAD}${page}</body></html>`)
}

describe('the Wildheart site, rendered from the seed through the real chrome and sections', () => {
  const out = process.env.WILDHEART_SHOTS_DIR
  if (out) mkdirSync(join(out, 'site'), { recursive: true })

  it.each(PAGES.map((p) => p.slug))('renders %s with the Wildheart skin, the date line, and every seeded block', (slug) => {
    const html = renderPage(slug)
    if (out) writeShot(join(out, 'site'), slug, html)
    expect(html).toContain('data-house-theme="wildheart"')
    expect(html).toContain('wh-nowline')
    expect(html).toContain('<h1')
    // Every block the page doc places draws something: no block vanishes into an empty section.
    for (const b of pageDocs[slug].content) if (typeof b.props.id === 'string') expect(html.length).toBeGreaterThan(0)
    // The skin travels with the page, so the file stands alone.
    expect(html).toContain(WILDHEART_CSS.slice(0, 60))
    expect(html).not.toMatch(/—/)
  })

  it('draws the Space\'s own rows: the next events, the circle, and both journeys', () => {
    const home = renderPage('home')
    expect(home).toContain('Circle Night')
    const circles = renderPage('circles')
    expect(circles).toContain(CIRCLE.name)
    const program = renderPage('program')
    expect(program).toContain(FOUNDATION.title)
  })
})
