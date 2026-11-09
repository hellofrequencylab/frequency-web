// FIXTURE RENDER: the Vanta site's four pages (Services theme) inside the real SiteChrome.
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/vanta-site.render.tsx
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))

const out = process.env.RENDER_OUT

it('renders the Vanta pages', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { SiteChrome } = await import('@/components/sites/site-chrome')
  const { servicesBlocks } = await import('@/components/page-editor/blocks/services')
  const { vantaSitePages, VANTA_FOOTER } = await import('@/lib/sites/vanta-site')
  const links = { origin: 'https://govanta.pro', slug: 'vanta', siteBase: '', pages: ['home', 'services', 'about', 'quote'], contactHref: '/quote', bookHref: '/quote', email: null }
  for (const p of vantaSitePages()) {
    const blocks = p.blocks.map((blk, n) => {
      const c = servicesBlocks[blk.type]
      return h('div', { key: n }, (c.render as (x: Record<string, unknown>) => never)({ ...c.defaultProps, ...blk.props, puck: { metadata: { links } } }))
    })
    const body = renderToStaticMarkup(
      h(SiteChrome as never, {
        brandName: 'Vanta', homeHref: '/', links: [{ label: 'About', href: '/about' }, { label: 'Services', href: '/services' }, { label: 'How it works', href: '/#process' }, { label: 'FAQ', href: '/#faq' }],
        cta: { href: '/quote', label: 'Free quote', external: false }, themeFonts: false,
        skin: { theme: 'services', season: 'fall', register: 'night' }, logoUrl: null, logoMode: null,
        tagline: 'Window & solar cleaning · North County', footer: VANTA_FOOTER, credit: 'badge', spaceSlug: null,
      } as never, ...blocks),
    )
    writeFileSync(`${out}/vanta-${p.slug}.html`, `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><link rel=stylesheet href="file://${out}/app.css">` + body.replace(/(src|href)="\/(sites|brand)\//g, '$1="file:///home/user/frequency-web/public/$2/').replace(/url\((&quot;|")\/(sites|brand)\//g, 'url($1file:///home/user/frequency-web/public/$2/'))
  }
})
