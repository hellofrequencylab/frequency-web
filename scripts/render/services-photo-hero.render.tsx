// FIXTURE RENDER (Services photo hero): the photo hero and header as the Vanta home wears them. Derived from services-kit-pages: every page of Services' trade kits drawn through the real SiteChrome (header, footer, skin sheet) and the real blocks,
// Night and Day, as bare HTML pages for the design pass. Writes $RENDER_OUT/<kit>__<slug>__<register>.html for each kit in RENDER_KITS
// (default every trade) and each page in RENDER_PAGES (default home,services,about,booking). Faces load from app/fonts through file URLs.
// Slot tokens resolve to the kit's sample words, as on a Space that has filled in nothing yet.
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/services-kit-pages.render.tsx
// then node scripts/render/services-kit-pages-shots.mjs <dir>
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))

const out = process.env.RENDER_OUT
const ROOT = process.cwd()
const face = (fam: string, f: string, style = 'normal', w = '100 900') => `@font-face{font-family:"${fam}";src:url("file://${ROOT}/app/fonts/${f}") format("woff2");font-style:${style};font-weight:${w}}`
const FACES = face('Bricolage Grotesque', 'bricolage-grotesque/bricolage-grotesque.woff2', 'normal', '200 800') + face('Lora', 'lora/lora.woff2', 'normal', '400 700') + face('Lora', 'lora/lora-italic.woff2', 'italic', '400 700') + face('DM Mono', 'dm-mono/dm-mono-400.woff2', 'normal', '400') + face('DM Mono', 'dm-mono/dm-mono-500.woff2', 'normal', '500')
// The page rhythm utilities the Space document wraps each block in (lib/page-editor/config.tsx), as the app's Tailwind sheet draws them.
const TAILWIND_RHYTHM = '.py-8{padding-top:2rem;padding-bottom:2rem}.space-y-12>:not(:last-child){margin-bottom:3rem}@media (min-width:40rem){.sm\\:py-10{padding-top:2.5rem;padding-bottom:2.5rem}.sm\\:space-y-14>:not(:last-child){margin-bottom:3.5rem}}'
const pub = (html: string) => html.replace(/ loading="lazy"/g, '').replace(/(src|href)="\/(sites|brand|themes)\//g, `$1="file://${ROOT}/public/$2/`)

it('renders a Services photo hero (the Vanta home) through the real chrome', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { WebsiteDocument } = await import('@/components/sites/website-document')
  const { config } = await import('@/lib/page-editor/config')
  const { SiteChrome } = await import('@/components/sites/site-chrome')
  const { HOUSE_CSS } = await import('@/components/sites/house-css')
  const { FREQUENCY_PAGE_CSS } = await import('@/components/sites/frequency-page-css')
  const { SERVICES_SITE_CSS } = await import('@/components/sites/services-css')
  const hero = { type: 'ServicesHero', props: { id: 'hero', alt: 'A window being washed in the morning light', lead: 'Window and solar panel cleaning for homes and small businesses along the coast. Owner-operated, done by hand, done right.', look: 'photo', image: '/sites/vanta/hero-window-wash.webp', title: 'Let the light *back in.*', offers: [{ href: '', meta: 'Interior & exterior glass', name: 'Window washing', price: 'Free quote' }, { href: '', meta: 'Pure-water rinse, soft brush', name: 'Solar panels', price: 'Free quote' }], eyebrow: 'North County / San Diego', panelNote: 'Two stories · Small commercial', panelTitle: 'Services', primaryHref: 'https://example.test/quote', primaryLabel: 'Get a free quote', secondaryHref: 'https://example.test/about', secondaryLabel: 'Meet Aiden' } }
  const doc = { root: { props: {} }, content: [hero], zones: {} }
  for (const register of ['night', 'day'] as const) {
    const site = renderToStaticMarkup(h(SiteChrome as never, { brandName: 'Vanta', homeHref: '/', links: ['About', 'Services', 'How it works', 'FAQ'].map((label) => ({ label, href: '/x' })), cta: { href: '/quote', label: 'Free quote', external: false }, themeFonts: false, skin: { theme: 'services', season: 'fall', register }, tagline: null, seasonNow: null, footer: { columns: [], blurb: '', line: null, note: null, copyright: null, suffix: null, subscribe: null, utility: null }, credit: 'badge', spaceSlug: null, previewMega: null, phone: '760-555-0142' } as never, h(WebsiteDocument as never, { doc, theme: 'Services', config, metadata: { space: {} }, live: { events: [], circles: [], journeys: [] }, links: { siteBase: '/', pages: ['home'] }, origin: 'https://example.test', title: 'Home' } as never)))
    writeFileSync(`${out}/photo-hero__${register}.html`, pub(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${TAILWIND_RHYTHM}${FACES}${HOUSE_CSS}${FREQUENCY_PAGE_CSS}${SERVICES_SITE_CSS}body{margin:0}</style></head><body>${site.replace(/url\(&quot;\/sites\//g, `url(&quot;file://${ROOT}/public/sites/`)}</body></html>`))
  }
})
