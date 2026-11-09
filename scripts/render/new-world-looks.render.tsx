// FIXTURE RENDER (LIVE-2175): a New World kit's pages in each of the theme's Looks ("Theme's own", Studio, Nightline, Paper, Trade),
// drawn through the real SiteChrome, blocks and skin with the site style a Look writes, resolved by the same functions the
// published site uses (readSiteStyle, siteDials, siteLookOverrides, siteLook, themeEditor). Writes
// $RENDER_OUT/<kit>__<slug>__<look>.html for the kit in RENDER_KIT (default general) and each page in RENDER_PAGES (default home).
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/new-world-looks.render.tsx
// then node scripts/render/new-world-looks-shots.mjs <dir>
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))

const out = process.env.RENDER_OUT
const ROOT = process.cwd()
const kitId = process.env.RENDER_KIT ?? 'general'
const slugs = (process.env.RENDER_PAGES ?? 'home').split(',')
const face = (fam: string, f: string, style = 'normal', w = '100 900') => `@font-face{font-family:"${fam}";src:url("file://${ROOT}/app/fonts/${f}") format("woff2");font-style:${style};font-weight:${w}}`
const FACES = face('Unbounded', 'unbounded/unbounded.woff2', 'normal', '200 900') + face('Hanken Grotesk', 'hanken-grotesk/hanken-grotesk.woff2') + face('Instrument Serif', 'instrument-serif/instrument-serif.woff2', 'normal', '400') + face('Instrument Serif', 'instrument-serif/instrument-serif-italic.woff2', 'italic', '400')
const pub = (html: string) => html.replace(/ loading="lazy"/g, '').replace(/(src|href)="\/(sites|brand|themes)\//g, `$1="file://${ROOT}/public/$2/`)

it('renders a New World kit in each Look', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { bindSlots } = await import('@/lib/spaces/content-slots')
  const { BlockRender } = await import('@/lib/page-editor/block-render')
  const { config } = await import('@/lib/page-editor/config')
  const { applyKit } = await import('@/lib/sites/kits/apply')
  const { loadKit } = await import('@/lib/sites/kits/registry')
  const { SiteChrome } = await import('@/components/sites/site-chrome')
  const { newWorldAccentVars } = await import('@/lib/theme/new-world')
  const { readSiteStyle, siteDials, siteLook, siteLookOverrides, siteRootDials } = await import('@/lib/theme/site-style')
  const { themeEditor } = await import('@/lib/themes/editor-dials')
  const ui = themeEditor('new-world', 'New World')
  const kit = (await loadKit(`new-world-${kitId}`))!
  const r = applyKit({ theme: 'NewWorld', pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
  if (!r.ok) throw new Error(r.error)
  const accent = Object.entries(newWorldAccentVars(null)).map(([k, v]) => `${k}:${v}`).join(';')
  for (const look of ui.looks) {
    // Picking a Look writes the dials it names; every other dial stays the theme's own.
    const style = readSiteStyle({ siteStyle: { theme: 'new-world', ...look.dials } })
    const d = siteDials(style, ui.own)
    for (const slug of slugs) {
      const page = r.snapshot.pages.find((p) => p.slug === slug)
      if (!page) continue
      for (const b of page.doc.content as { type: string; props: Record<string, unknown> }[]) {
        if (b.type === 'ServicesHero') { b.props.image = '/sites/new-world/photos/circle-sunrise.webp'; b.props.alt = 'A circle at sunrise' }
      }
      const site = renderToStaticMarkup(
        h(
          SiteChrome as never,
          {
            brandName: kit.label,
            homeHref: '/',
            links: r.snapshot.pages.map((p) => ({ label: p.label ?? p.slug, href: `/${p.slug}` })),
            cta: { href: '/contact', label: 'Get in touch', external: false },
            themeFonts: false,
            skin: { theme: 'new-world', season: 'fall', register: d.register === 'day' ? 'day' : 'night', dials: siteRootDials(d) },
            look: siteLookOverrides(style),
            showBrandFooter: siteLook(style).footer === 'full',
            tagline: null,
            seasonNow: null,
            footer: { columns: [], blurb: kit.description, line: null, note: null, copyright: null, suffix: null, subscribe: null, utility: null },
            credit: 'badge',
            spaceSlug: null,
            previewMega: null,
          } as never,
          h('div', null, h(BlockRender, { config, data: bindSlots(page.doc, {}) } as never)),
        ),
      )
      writeFileSync(`${out}/${kitId}__${slug}__${look.id}.html`, pub(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${FACES}*,*::before,*::after{box-sizing:border-box}body{margin:0}[data-house-theme="new-world"]{${accent}}</style></head><body>${site}</body></html>`))
    }
  }
})
