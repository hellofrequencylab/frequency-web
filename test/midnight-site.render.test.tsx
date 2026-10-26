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
import { MIDNIGHT_CSS } from '@/components/sites/midnight-css'
import { midnightSitePages } from '@/lib/sites/midnight-home'
import { midnightAccentVars } from '@/lib/theme/midnight'

vi.mock('@/components/sites/site-admin-gate', () => ({
  useSiteAdmin: () => true,
  SiteAdminOnly: ({ children }: { children: React.ReactNode }) => children,
}))

// THE MIDNIGHT SITE, RENDERED OFFLINE through the real chrome and sections (the same tree the Next page draws one
// level down). With MIDNIGHT_SHOTS_DIR set, each page of the design's page set is written as a standalone HTML
// file for the side-by-side render against Web Theme.html.

const ORIGIN = 'https://frequency.example'
const NOW = new Date(Date.UTC(2026, 9, 26, 20))
const links: SiteLinkMap = { origin: ORIGIN, slug: 'nocturne', siteBase: '', pages: ['home', 'offerings', 'book', 'gatherings', 'journeys', 'shop', 'membership', 'library'], contactHref: '/contact', bookHref: '/book', email: null }
const menu = ['Offerings', 'Book', 'Gatherings', 'Journeys', 'Shop', 'Membership', 'Library'].map((label) => ({ href: `/${label.toLowerCase()}`, label }))
const live: MwLive = { events: [], circles: [], journeys: [] }
const metadata = { space: { identity: { name: 'Nocturne' }, slug: 'nocturne', tagline: 'Counsel, gatherings and journeys.', events: [], series: [], reviews: { count: 0, average: 0, latest: [] } }, links }

function chrome(children: React.ReactNode) {
  return (
    <div style={midnightAccentVars(null) as React.CSSProperties}>
    <SiteChrome brandName="Nocturne" homeHref="/" links={menu} cta={{ href: '/book', label: 'Book a session', external: false }} themeFonts skin={{ theme: 'midnight', season: 'fall' }} tagline="Counsel, gatherings and journeys." showBrandFooter seasonNow={{ module: 'Waxing crescent circle', theme: null, next: '2026-11-18T19:00:00Z' }}>
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
<style>html,body{margin:0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.hidden{display:none}@media (min-width:768px){.md\\:block{display:block}.md\\:hidden{display:none}}</style></head><body>`

const FONT_VARS = "--font-mn-bodoni:'Bodoni Moda';--font-mn-marcellus:Marcellus;--font-mn-geist:Geist"

describe('the Midnight site, rendered through the real chrome and sections', () => {
  const dir = process.env.MIDNIGHT_SHOTS_DIR
  if (dir) mkdirSync(dir, { recursive: true })

  it('renders every page of the design page set inside the Midnight root', () => {
    for (const p of midnightSitePages()) {
      const blocksIn = p.blocks.map((b, i) => ({ type: b.type, props: { id: `${p.slug}-${i}`, ...b.props } })) as MwBlock[]
      const html = renderToStaticMarkup(page(blocksIn, p.title))
      if (dir) writeFileSync(join(dir, `${p.slug}.html`), `${HEAD_(p.slug)}<div style="${FONT_VARS}">${html}</div></body></html>`)
      expect(html, p.slug).toContain('data-house-theme="midnight"')
      expect(html, p.slug).toContain(MIDNIGHT_CSS.slice(0, 60))
      expect(html, p.slug).toContain('mn-logo-ring')
      expect(html, p.slug).toContain('mn-bar-moon')
      expect(html, p.slug).not.toMatch(/—/)
    }
  })
})
