// FIXTURE RENDER: the Mindless Home (the Mindless block family inside the site chrome), drawn with the real SiteChrome, the real
// skin CSS and the real faces, for the passes beside the design (the Mindless design system, ui_kits/website).
// Writes $RENDER_OUT/ml-home.html.
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/mindless-home.render.tsx
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))

const out = process.env.RENDER_OUT
const ROOT = resolve(__dirname, '../..')
const face = (fam: string, f: string, w: string) => `@font-face{font-family:"${fam}";src:url("file://${ROOT}/app/fonts/${f}") format("woff2");font-weight:${w}}`

it('renders the Mindless Home', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { mindlessBlocks } = await import('@/components/page-editor/blocks/mindless')
  const H = await import('@/lib/sites/mindless-home')
  const { SiteChrome } = await import('@/components/sites/site-chrome')
  const { MINDLESS_CSS } = await import('@/components/sites/mindless-css')
  const { HOUSE_CSS } = await import('@/components/sites/house-css')
  const blocks: [string, Record<string, unknown>][] = (process.env.RENDER_BLOCKS ? JSON.parse(process.env.RENDER_BLOCKS) : null) ?? [
    ['MindlessHero', H.MINDLESS_HERO], ['MindlessSplit', H.MINDLESS_SPLIT], ['MindlessPillars', H.MINDLESS_PILLARS], ['MindlessCircles', H.MINDLESS_CIRCLES],
    ['MindlessPeople', H.MINDLESS_PEOPLE], ['MindlessCarry', H.MINDLESS_CARRY], ['MindlessOffers', H.MINDLESS_OFFERS], ['MindlessFaq', H.MINDLESS_FAQ], ['MindlessCta', H.MINDLESS_CTA],
  ]
  const links = [{ label: 'Home', href: '/' }, { label: 'Services', href: '/services' }, { label: 'About', href: '/about' }, { label: 'Book', href: '/booking' }]
  const meta = { links: { origin: 'https://x.test', slug: 'mindless', siteBase: '', pages: ['home', 'services', 'about', 'booking', 'circles'], contactHref: '/contact', bookHref: null, email: null } }
  const body = renderToStaticMarkup(
    h(SiteChrome as never, {
      brandName: 'Mindless', homeHref: '/', links, cta: { href: '/join', label: 'Join', external: false }, themeFonts: false,
      skin: { theme: 'mindless' }, tagline: 'Unwind your mind.',
      footer: { columns: [], blurb: 'Meditation for loud lives.', line: null, note: null, copyright: null, suffix: null, subscribe: null, utility: null },
      credit: 'badge', spaceSlug: null, previewMega: null,
    } as never,
    h('div', { className: 'mw-page' }, ...blocks.map(([type, props], i) => { const c = mindlessBlocks[type]; return h('div', { key: i, className: `site-doc-section site-layout-${i}` }, h('div', null, h('div', { className: 'space-y-12 py-8' }, (c.render as (p: Record<string, unknown>) => never)({ ...c.defaultProps, ...props, puck: { metadata: meta } })))) }))),
  )
  const css = `${face('Rubik Wet Paint', 'rubik-wet-paint/rubik-wet-paint-400.woff2', '400')}${face('Archivo', 'archivo/archivo-400.woff2', '400')}${face('Archivo', 'archivo/archivo-800.woff2', '800')}`
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}${HOUSE_CSS}*,*::before,*::after{box-sizing:border-box}body{margin:0}[data-house-theme]{--font-ml-paint:"Rubik Wet Paint";--font-ml-archivo:"Archivo"}</style><style>${MINDLESS_CSS}</style></head><body>${body}</body></html>`
  writeFileSync(`${out}/ml-home.html`, html.replace(/ loading="lazy"/g, '').replace(/url\(&quot;\/sites\//g, `url(&quot;file://${ROOT}/public/sites/`).replace(/url\("\/sites\//g, `url("file://${ROOT}/public/sites/`).replace(/(src|href)="\/(sites|brand)\//g, `$1="file://${ROOT}/public/$2/`))
})
