// FIXTURE RENDER: every page of Services' trade kits drawn through the real SiteChrome (header, footer, skin sheet) and the real blocks,
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
const slugs = (process.env.RENDER_PAGES ?? 'home,services,about,booking').split(',')
const face = (fam: string, f: string, style = 'normal', w = '100 900') => `@font-face{font-family:"${fam}";src:url("file://${ROOT}/app/fonts/${f}") format("woff2");font-style:${style};font-weight:${w}}`
const FACES = face('Bricolage Grotesque', 'bricolage-grotesque/bricolage-grotesque.woff2', 'normal', '200 800') + face('Lora', 'lora/lora.woff2', 'normal', '400 700') + face('Lora', 'lora/lora-italic.woff2', 'italic', '400 700') + face('DM Mono', 'dm-mono/dm-mono-400.woff2', 'normal', '400') + face('DM Mono', 'dm-mono/dm-mono-500.woff2', 'normal', '500')
// RENDER_DIALS=type,motion,image (e.g. editorial,off,mono) draws the pages with those dial values on the root (LIVE-2189).
const [dType, dMotion, dImage] = (process.env.RENDER_DIALS ?? '').split(',')
const dials = process.env.RENDER_DIALS ? { type: dType, motion: dMotion, image: dImage } : null
const pub = (html: string) => html.replace(/ loading="lazy"/g, '').replace(/(src|href)="\/(sites|brand|themes)\//g, `$1="file://${ROOT}/public/$2/`)

it('renders the Services trade kit pages', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { BlockRender } = await import('@/lib/page-editor/block-render')
  const { config } = await import('@/lib/page-editor/config')
  const { applyKit } = await import('@/lib/sites/kits/apply')
  const { loadKit } = await import('@/lib/sites/kits/registry')
  const { SiteChrome } = await import('@/components/sites/site-chrome')
  const { HOUSE_CSS } = await import('@/components/sites/house-css')
  const { FREQUENCY_PAGE_CSS } = await import('@/components/sites/frequency-page-css')
  const { SERVICES_SITE_CSS } = await import('@/components/sites/services-css')
  const { servicesAccentVars } = await import('@/lib/theme/services')
  const { SERVICES_TRADE_IDS } = await import('@/lib/sites/kits/services-trades-data')
  const { bindSlots } = await import('@/lib/spaces/content-slots')
  const kits = process.env.RENDER_KITS ? process.env.RENDER_KITS.split(',') : [...SERVICES_TRADE_IDS]
  for (const trade of kits) {
    const kit = (await loadKit(`services-${trade}`))!
    const r = applyKit({ theme: 'Services', pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
    if (!r.ok) throw new Error(r.error)
    const accent = Object.entries(servicesAccentVars(kit.accent ?? null) ?? {}).map(([k, v]) => `${k}:${v}`).join(';')
    for (const slug of slugs) {
      const page = r.snapshot.pages.find((p) => p.slug === slug)
      if (!page) continue
      for (const register of ['night', 'day'] as const) {
        const body = h('div', null, h(BlockRender, { config, data: bindSlots(page.doc, {}) } as never))
        const site = renderToStaticMarkup(
          h(
            SiteChrome as never,
            {
              brandName: kit.label,
              homeHref: '/',
              links: r.snapshot.pages.map((p) => ({ label: p.label ?? p.slug, href: `/${p.slug}` })),
              cta: { href: '/booking', label: 'Book now', external: false },
              themeFonts: false,
              skin: { theme: 'services', season: 'fall', register, ...(dials ? { dials } : {}) },
              tagline: null,
              seasonNow: null,
              footer: { columns: [], blurb: kit.description, line: null, note: null, copyright: null, suffix: null, subscribe: null, utility: null },
              credit: 'badge',
              spaceSlug: null,
              previewMega: null,
            } as never,
            body,
          ),
        )
        writeFileSync(`${out}/${trade}__${slug}__${register}.html`, pub(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${FACES}${HOUSE_CSS}${FREQUENCY_PAGE_CSS}${SERVICES_SITE_CSS}body{margin:0}</style></head><body><div style="${accent}">${site}</div></body></html>`))
      }
    }
  }
})
