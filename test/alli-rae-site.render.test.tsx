import { describe, expect, it, vi } from 'vitest'
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
import { alliRaeSitePages, ALLI_RAE, ALLI_RAE_FOOTER } from '@/lib/sites/alli-rae-site'
import { designerAccentVars } from '@/lib/theme/designer'

vi.mock('@/components/sites/site-admin-gate', () => ({
  useSiteAdmin: () => true,
  SiteAdminOnly: ({ children }: { children: React.ReactNode }) => children,
}))

// ALLI RAE BUILD + DESIGN on the Designer theme, rendered offline through the real chrome and sections. With
// ALLI_SHOTS_DIR set, each page is written as a standalone HTML file for the side-by-side render.

const ORIGIN = 'https://frequency.example'
const NOW = new Date(Date.UTC(2026, 9, 26, 20))
const pages = alliRaeSitePages()
const links: SiteLinkMap = { origin: ORIGIN, slug: 'alli-rae', siteBase: '', pages: pages.map((p) => p.slug), contactHref: '/contact', bookHref: null, email: null }
const menu = pages.filter((p) => p.nav).map((p) => ({ href: `/${p.slug}`, label: p.title }))
const live: MwLive = { events: [], circles: [], journeys: [] }
const metadata = { space: { identity: { name: ALLI_RAE.name }, slug: 'alli-rae', tagline: ALLI_RAE.tagline, events: [], series: [], reviews: { count: 0, average: 0, latest: [] } }, links }

function chrome(children: React.ReactNode) {
  return (
    <div style={designerAccentVars(null) as React.CSSProperties}>
      <SiteChrome brandName={ALLI_RAE.name} homeHref="/" links={menu} cta={{ href: '/ready-to-build', label: 'Build Your Dream Now', external: false }} themeFonts skin={{ theme: 'designer', season: 'fall' }} logoUrl={ALLI_RAE.logo} tagline={ALLI_RAE.tagline} showBrandFooter footer={{ columns: ALLI_RAE_FOOTER.columns.map((c) => ({ title: c.title, links: [...c.links] })), blurb: ALLI_RAE_FOOTER.blurb, line: ALLI_RAE_FOOTER.line, note: ALLI_RAE_FOOTER.note, suffix: null }}>
        {children}
      </SiteChrome>
    </div>
  )
}

function page(blocksIn: MwBlock[], title: string) {
  const plan = planMensworkPage(blocksIn)
  return chrome(<MensworkPage blocks={blocksIn} plan={plan} live={live} links={links} origin={ORIGIN} pageTitle={title} now={NOW} renderOther={(b) => <BlockRender config={config} data={{ root: {}, content: [b] }} metadata={metadata} />} />)
}

const HEAD_ = (title: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>html,body{margin:0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.hidden{display:none}@media (min-width:768px){.md\\:block{display:block}.md\\:hidden{display:none}}</style></head><body>`

describe('Alli Rae Design & Build on the Designer theme', () => {
  const dir = process.env.ALLI_SHOTS_DIR
  if (dir) mkdirSync(dir, { recursive: true })

  it('renders every page of the site inside the Designer root with the firm\'s own words', () => {
    expect(pages.map((p) => p.slug)).toEqual(['home', 'portfolio', 'about', 'spanish-modern-custom-home', 'mid-century-modern-bathroom-remodel', 'breezy-island-kitchen-remodel', 'ready-to-build', 'book-a-consultation'])
    for (const p of pages) {
      const blocksIn = p.blocks.map((b, i) => ({ type: b.type, props: { id: `${p.slug}-${i}`, ...b.props } })) as MwBlock[]
      const html = renderToStaticMarkup(page(blocksIn, p.title))
      if (dir) writeFileSync(join(dir, `${p.slug}.html`), `${HEAD_(p.slug)}<div style="--font-dz-cormorant:Cormorant;--font-dz-jost:Jost">${html}</div></body></html>`)
      expect(html, p.slug).toContain('data-house-theme="designer"')
      expect(html, p.slug).not.toMatch(/—/)
    }
    const home = renderToStaticMarkup(page(pages[0].blocks.map((b, i) => ({ type: b.type, props: { id: `h-${i}`, ...b.props } })) as MwBlock[], 'Home'))
    expect(home).toContain('From Permits')
    expect(home).toContain('Mid Century Modern Bathroom Remodel')
    expect(home).toContain('(760) 707-6401')
  })
})
