// FIXTURE RENDER: the Aiden Tyack kit's pages (aidentyack.com) inside the real SiteChrome, drawn the way a live page draws them
// (WebsiteDocument with a Space in the metadata, so a block holding only sample copy hides exactly as it does in production).
// Writes $RENDER_OUT/aiden-<slug>.html; the stylesheet is $RENDER_OUT/app.css from scripts/render/build-css.mjs. Photos and the mark
// load from /sites/..., so serve $RENDER_OUT over http with public/sites linked in (the mark is a CSS mask, which a file:// page refuses).
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/aiden-tyack-site.render.tsx
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/app/(main)/spaces/[slug]/contact-form-actions', () => ({ submitContactForm: async () => ({ ok: true }) }))

const out = process.env.RENDER_OUT
/** The footer the live Space carries (preferences.siteFooter): the announce line, the blurb and three link columns. */
const FOOTER = {
  columns: [
    { title: 'Shop', links: [{ label: 'The shop', href: '/shop' }, { label: 'Custom pieces', href: '/visit' }], lines: [] },
    { title: 'About', links: [{ label: 'The maker', href: '/about' }], lines: [] },
    { title: 'Help', links: [{ label: 'Contact', href: '/visit' }, { label: 'Questions', href: '/shop' }], lines: [] },
  ],
  blurb: 'One line that sums up the brand', line: null, note: null, suffix: null, copyright: null, logo: null, band: null, subscribe: null,
  utility: { left: 'One short line of news or a promise people care about.', items: [] },
}
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@1,400;1,500&family=Grenze+Gotisch:wght@700&display=swap"><style>:root{--font-at-display:"Grenze Gotisch";--font-at-body:"Archivo";--font-at-voice:"Cormorant Garamond"}</style>'

it('renders the Aiden Tyack pages', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { SiteChrome } = await import('@/components/sites/site-chrome')
  const { WebsiteDocument } = await import('@/components/sites/website-document')
  const { config } = await import('@/lib/page-editor/config')
  const { applyKit } = await import('@/lib/sites/kits/apply')
  const { loadKit } = await import('@/lib/sites/kits/registry')
  const { websiteThemeVars, WEBSITE_TOKEN_CSS } = await import('@/lib/sites/editor/theme')
  const kit = (await loadKit('aiden-tyack-general'))!
  const r = applyKit({ theme: 'AidenTyack', pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
  if (!r.ok) throw new Error(r.error)
  // The live site publishes the kit's words as the owner's own (sample cleared), so every section draws.
  const pages = r.snapshot.pages.map((p) => ({ ...p, doc: { ...p.doc, content: p.doc.content.map((b) => ({ ...b, props: { ...b.props, sample: false } })) } }))
  const links = { origin: 'https://aidentyack.com', slug: 'aidentyack', siteBase: '', pages: pages.map((p) => p.slug), contactHref: '/visit', bookHref: null, email: null }
  const nav = pages.map((p) => ({ label: p.label, href: p.slug === 'home' ? '/' : `/${p.slug}` }))
  const live = { events: [], circles: [], offerings: [], memberships: [], chapters: [] }
  for (const page of pages) {
    const body = renderToStaticMarkup(
      h('div', { 'data-website-theme': 'AidenTyack', style: websiteThemeVars('AidenTyack' as never, '#582F0E') },
        h('style', null, WEBSITE_TOKEN_CSS),
        h(SiteChrome as never, {
          brandName: 'Aiden Tyack', homeHref: '/', links: nav, cta: null, themeFonts: true,
          skin: { theme: 'aiden-tyack', season: 'fall', register: 'day', family: 'walnut' }, logoUrl: null, logoMode: null,
          tagline: null, footer: FOOTER, credit: 'badge', spaceSlug: 'aidentyack',
        } as never,
        h(WebsiteDocument as never, { doc: page.doc, theme: 'AidenTyack', config, metadata: { space: { spaceId: 'fixture', slug: 'aidentyack' } }, live, links, origin: 'https://aidentyack.com', title: page.label } as never)),
      ),
    )
    const html = `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">${FONTS}<link rel=stylesheet href="app.css"></head><body>${body}</body></html>`
    writeFileSync(`${out}/aiden-${page.slug}.html`, html)
  }
})
