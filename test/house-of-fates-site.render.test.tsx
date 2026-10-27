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
import { readSiteFooter } from '@/lib/sites/site-footer'
import { houseOfFatesSitePages, HOUSE_OF_FATES, HOF_FOOTER } from '@/lib/sites/house-of-fates-site'

vi.mock('@/components/sites/site-admin-gate', () => ({
  useSiteAdmin: () => true,
  SiteAdminOnly: ({ children }: { children: React.ReactNode }) => children,
}))

// HOUSE OF FATES on the Midnight theme, rendered offline through the real chrome and sections. With HOF_SHOTS_DIR
// set, each page is written as a standalone HTML file for the side-by-side render.

const ORIGIN = 'https://frequency.example'
const NOW = new Date(Date.UTC(2026, 9, 26, 20))
const pages = houseOfFatesSitePages()
const links: SiteLinkMap = { origin: ORIGIN, slug: 'house-of-fates', siteBase: '', pages: pages.map((p) => p.slug), contactHref: '/contact-us', bookHref: null, email: null }
const menu = pages.filter((p) => p.nav).map((p) => ({ href: `/${p.slug}`, label: p.title }))
const live: MwLive = { events: [], circles: [], journeys: [] }
const metadata = { space: { identity: { name: HOUSE_OF_FATES.name }, slug: 'house-of-fates', tagline: HOUSE_OF_FATES.tagline, events: [], series: [], reviews: { count: 0, average: 0, latest: [] } }, links }

function page(blocksIn: MwBlock[], title: string) {
  const plan = planMensworkPage(blocksIn)
  return (
    <SiteChrome brandName={HOUSE_OF_FATES.name} homeHref="/" links={menu} cta={{ href: '/contact-us', label: 'Book a free consultation', external: false }} themeFonts skin={{ theme: 'midnight', season: 'fall' }} logoUrl={HOUSE_OF_FATES.logo} tagline={HOUSE_OF_FATES.tagline} showBrandFooter spaceSlug="house-of-fates" footer={readSiteFooter({ siteFooter: HOF_FOOTER })}>
      <MensworkPage blocks={blocksIn} plan={plan} live={live} links={links} origin={ORIGIN} pageTitle={title} now={NOW} renderOther={(b) => <BlockRender config={config} data={{ root: {}, content: [b] }} metadata={metadata} />} />
    </SiteChrome>
  )
}

describe('House of Fates on the Midnight theme', () => {
  const dir = process.env.HOF_SHOTS_DIR
  if (dir) mkdirSync(dir, { recursive: true })

  it('renders every page inside the Midnight root with the house\'s own words', () => {
    for (const p of pages) {
      const blocksIn = p.blocks.map((b, i) => ({ type: b.type, props: { id: `${p.slug}-${i}`, ...b.props } })) as MwBlock[]
      const html = renderToStaticMarkup(page(blocksIn, p.title))
      if (dir) writeFileSync(join(dir, `${p.slug}.html`), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${p.slug}</title><style>html,body{margin:0}</style></head><body>${html}</body></html>`)
      expect(html, p.slug).toContain('data-house-theme="midnight"')
      expect(html, p.slug).not.toMatch(/—/)
    }
    const home = renderToStaticMarkup(page(pages[0].blocks.map((b, i) => ({ type: b.type, props: { id: `h-${i}`, ...b.props } })) as MwBlock[], 'Home'))
    expect(home).toContain('mn-hero--left')
    expect(home).toContain('Hypnotic Sound')
    expect(home).toContain('Join our email list.')
  })
})
