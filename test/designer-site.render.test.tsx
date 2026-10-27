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
import { DESIGNER_CSS } from '@/components/sites/designer-css'
import { designerSitePages } from '@/lib/sites/designer-home'
import { designerAccentVars } from '@/lib/theme/designer'

vi.mock('@/components/sites/site-admin-gate', () => ({
  useSiteAdmin: () => true,
  SiteAdminOnly: ({ children }: { children: React.ReactNode }) => children,
}))

// THE DESIGNER SITE, RENDERED OFFLINE through the real chrome and sections (the same tree the Next page draws one
// level down). With DESIGNER_SHOTS_DIR set, each page of the page set is written as a standalone HTML file for the
// side-by-side render against the design.

const ORIGIN = 'https://frequency.example'
const NOW = new Date(Date.UTC(2026, 9, 26, 20))
const links: SiteLinkMap = { origin: ORIGIN, slug: 'studio', siteBase: '', pages: ['home', 'about', 'portfolio', 'contact', 'consultation'], contactHref: '/contact', bookHref: null, email: null }
const menu = ['About', 'Portfolio', 'Contact'].map((label) => ({ href: `/${label.toLowerCase()}`, label }))
const live: MwLive = { events: [], circles: [], journeys: [] }
const metadata = { space: { identity: { name: 'Studio' }, slug: 'studio', tagline: 'A design and build firm.', events: [], series: [], reviews: { count: 0, average: 0, latest: [] } }, links }

function chrome(children: React.ReactNode) {
  return (
    <div style={designerAccentVars(null) as React.CSSProperties}>
      <SiteChrome brandName="Studio" homeHref="/" links={menu} cta={{ href: '/contact', label: 'Build your dream now', external: false }} themeFonts skin={{ theme: 'designer', season: 'fall' }} tagline="A design and build firm." showBrandFooter>
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

const FONT_VARS = "--font-dz-cormorant:Cormorant;--font-dz-jost:Jost"

describe('the Designer site, rendered through the real chrome and sections', () => {
  const dir = process.env.DESIGNER_SHOTS_DIR
  if (dir) mkdirSync(dir, { recursive: true })

  it('renders every page of the page set inside the Designer root', () => {
    for (const p of designerSitePages()) {
      const blocksIn = p.blocks.map((b, i) => ({ type: b.type, props: { id: `${p.slug}-${i}`, ...b.props } })) as MwBlock[]
      const html = renderToStaticMarkup(page(blocksIn, p.title))
      if (dir) writeFileSync(join(dir, `${p.slug}.html`), `${HEAD_(p.slug)}<div style="${FONT_VARS}">${html}</div></body></html>`)
      expect(html, p.slug).toContain('data-house-theme="designer"')
      expect(html, p.slug).toContain(DESIGNER_CSS.slice(0, 60))
      expect(html, p.slug).not.toMatch(/—/)
    }
  })
})
