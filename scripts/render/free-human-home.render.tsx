// FIXTURE RENDER: the Free Human Home (the eight blocks inside the site chrome), drawn with the real
// SiteChrome, the real skin CSS and the real faces, for the before/after passes beside the design (templates/website/Website.dc.html).
// Writes $RENDER_OUT/fh-home.html.
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/free-human-home.render.tsx
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))

const out = process.env.RENDER_OUT
const FONTS = '/home/user/frequency-web/app/fonts'
const face = (fam: string, f: string, style = 'normal', w = '100 900') => `@font-face{font-family:"${fam}";src:url("file://${FONTS}/${f}") format("woff2");font-style:${style};font-weight:${w}}`

it('renders the Free Human Home', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { freeHumanBlocks } = await import('@/components/page-editor/blocks/free-human')
  const { freeHumanHomeBlocks } = await import('@/lib/sites/free-human-home')
  const { SiteChrome } = await import('@/components/sites/site-chrome')
  const { FREE_HUMAN_CSS } = await import('@/components/sites/free-human-css')
  const { HOUSE_CSS } = await import('@/components/sites/house-css')
  const links = [
    { label: 'Program', href: '/program' },
    { label: 'Workshops', href: '/workshops' },
    { label: 'Events', href: '/calendar' },
    { label: 'Calendar', href: '/calendar' },
    { label: 'Books', href: '/books' },
    { label: 'Speaking', href: '/speaking' },
    { label: 'Contact', href: '/contact' },
  ]
  const css = `${face('Cormorant Garamond', 'free-human/cormorant-garamond.woff2', 'normal', '300 700')}${face('Cormorant Garamond', 'free-human/cormorant-garamond-italic.woff2', 'italic', '300 700')}${face('Marcellus', 'temple/marcellus.woff2', 'normal', '400')}${face('Hanken Grotesk', 'hanken-grotesk/hanken-grotesk.woff2', 'normal', '100 900')}`
  const page = (previewMega: string | null) =>
    renderToStaticMarkup(
      h(
        SiteChrome as never,
        {
          brandName: 'Free Human Movement',
          homeHref: '/',
          links,
          cta: { href: '/join', label: 'Join us', external: false },
          themeFonts: false,
          skin: { theme: 'free-human', season: 'fall' },
          tagline: null,
          seasonNow: { module: 'Autumn circle opens', theme: null, next: '2026-11-05T19:00:00' },
          footer: { columns: [], blurb: 'Embodiment and child-rearing for women in their season of creation. Created by Audrey Uma Wilder.', line: null, note: null, copyright: null, suffix: null, subscribe: null, utility: null },
          credit: 'badge',
          spaceSlug: null,
          previewMega,
        } as never,
        h('div', null, ...freeHumanHomeBlocks().map((b, i) => { const c = freeHumanBlocks[b.type]; return h('div', { key: i }, (c.render as (p: Record<string, unknown>) => never)({ ...c.defaultProps, ...b.props, puck: { metadata: { links: { origin: 'https://x.test', slug: 'house', siteBase: '', pages: ['home'], contactHref: '/contact', bookHref: null, email: null } } } })) })),
      ),
    )
  const pub = (html: string) => html.replace(/ loading="lazy"/g, '').replace(/(src|href)="\/(sites|brand)\//g, '$1="file:///home/user/frequency-web/public/$2/')
  const doc = (body: string) => pub(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}${HOUSE_CSS}*,*::before,*::after{box-sizing:border-box}body{margin:0}[data-house-theme]{--font-fh-cormorant:"Cormorant Garamond";--font-fh-marcellus:Marcellus;--font-fh-hanken:"Hanken Grotesk"}</style><style>${FREE_HUMAN_CSS}</style></head><body>${body}</body></html>`)
  writeFileSync(`${out}/fh-home.html`, doc(page(null)))
})
