// FIXTURE RENDER: every page of a New World kit (Home, Services, About, Book) drawn with the real SiteChrome, blocks and skin, the
// way a published New World site renders them. Writes $RENDER_OUT/<kit>-<slug>.html. RENDER_KITS picks kits (default general),
// RENDER_REGISTER night|day (default night). Slot tokens resolve to their sample words, as on a Space that has not filled them in.
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/new-world-site-pages.render.tsx
// then screenshot with node scripts/render/shot.mjs <dir>/general-home.html <prefix>.
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
const FACES = face('Unbounded', 'unbounded/unbounded.woff2', 'normal', '200 900') + face('Hanken Grotesk', 'hanken-grotesk/hanken-grotesk.woff2') + face('Instrument Serif', 'instrument-serif/instrument-serif-italic.woff2', 'italic', '400')
const pub = (html: string) => html.replace(/ loading="lazy"/g, '').replace(/(src|href)="\/(sites|brand|themes)\//g, `$1="file://${ROOT}/public/$2/`).replace(/url\(&quot;\/(sites|brand)\//g, `url(&quot;file://${ROOT}/public/$1/`)

it('renders every page of the New World kits', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { BlockRender } = await import('@/lib/page-editor/block-render')
  const { config } = await import('@/lib/page-editor/config')
  const { applyKit } = await import('@/lib/sites/kits/apply')
  const { loadKit } = await import('@/lib/sites/kits/registry')
  const { SiteChrome } = await import('@/components/sites/site-chrome')
  const { NEW_WORLD_CSS } = await import('@/components/sites/new-world-css')
  const { HOUSE_CSS } = await import('@/components/sites/house-css')
  const { FREQUENCY_PAGE_CSS } = await import('@/components/sites/frequency-page-css')
  const { newWorldAccentVars } = await import('@/lib/theme/new-world')
  const { bindSlots } = await import('@/lib/spaces/content-slots')
  const register = process.env.RENDER_REGISTER === 'day' ? 'day' : 'night'
  const accent = Object.entries(newWorldAccentVars(null)).map(([k, v]) => `${k}:${v}`).join(';')
  for (const niche of (process.env.RENDER_KITS ?? 'general').split(',')) {
    const kit = (await loadKit(`new-world-${niche}`))!
    const r = applyKit({ theme: 'NewWorld', pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
    if (!r.ok) throw new Error(r.error)
    for (const page of r.snapshot.pages) {
      const doc = bindSlots(page.doc as never, {}) as never
      const site = renderToStaticMarkup(
        h(
          SiteChrome as never,
          {
            brandName: kit.label === 'Your place' ? 'Your Place' : kit.label,
            homeHref: '/',
            links: r.snapshot.pages.filter((p) => p.slug !== 'home').map((p) => ({ label: p.label, href: `/${p.slug}` })),
            cta: { href: '/booking', label: 'Book', external: false },
            themeFonts: false,
            skin: { theme: 'new-world', season: 'fall', register },
            tagline: null,
            seasonNow: null,
            footer: { columns: [], blurb: 'What you do, in four words', line: null, note: null, copyright: null, suffix: null, subscribe: null, utility: null },
            credit: 'badge',
            spaceSlug: null,
            previewMega: null,
          } as never,
          h(BlockRender, { config, data: doc } as never),
        ),
      )
      writeFileSync(`${out}/${niche}-${page.slug || 'home'}.html`, pub(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${FACES}${HOUSE_CSS}${FREQUENCY_PAGE_CSS}${NEW_WORLD_CSS}*,*::before,*::after{box-sizing:border-box}body{margin:0}[data-house-theme="new-world"]{${accent}}</style></head><body>${site}</body></html>`))
    }
  }
})
