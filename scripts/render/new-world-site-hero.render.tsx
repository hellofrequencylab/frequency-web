// FIXTURE RENDER: New World site chrome (header with a round owner photo) around the house hero, drawn with the real SiteChrome.
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/new-world-site-hero.render.tsx
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))

const out = process.env.RENDER_OUT

it('renders the New World site hero', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { SiteChrome } = await import('@/components/sites/site-chrome')
  const { HouseHero } = await import('@/components/sites/house-sections')
  const photo = process.env.RENDER_PHOTO ?? '/brand/new-world-kit/hero.jpg'
  const body = renderToStaticMarkup(
    h(
      SiteChrome as never,
      {
        brandName: 'Daniel Tyack', homeHref: '/', links: [{ label: 'Work', href: '/work' }, { label: 'About', href: '/about' }],
        cta: { href: '/book', label: 'Book an exploratory call', external: false }, themeFonts: false,
        skin: { theme: 'new-world', season: 'fall', register: 'night' }, logoUrl: photo, logoMode: 'photo',
        tagline: null, footer: null, credit: 'badge', spaceSlug: null,
      } as never,
      h(HouseHero as never, { hero: { photo, focus: '49% 45%', eyebrow: null, title: 'Fine, but *not okay.*', lede: 'Body-based emotional guidance.', cta: { href: '/book', label: 'Book', external: false }, secondary: null, pill: null } }),
    ),
  )
  writeFileSync(`${out}/nw-site.html`, body.replace(/(src|href)="\/(sites|brand)\//g, '$1="file:///home/user/frequency-web/public/$2/'))
})
