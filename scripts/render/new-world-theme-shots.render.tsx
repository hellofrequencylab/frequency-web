// FIXTURE RENDER: the New World kit's Website, Spotlight and Email for each of its seven kits, as bare HTML pages (the
// pictures on /themes/new-world: public/brand/new-world-kit/shots/<kit>-site.jpg, -spot.jpg and -email.jpg). The Website is the
// kit's Home drawn with the real SiteChrome, blocks and skin; the Spotlight is the kit's default layout through the real
// layout component; the email is the kit's welcome through the real email module.
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/new-world-theme-shots.render.tsx
// then node scripts/render/new-world-theme-shots.mjs <dir>
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))

const out = process.env.RENDER_OUT
const ROOT = '/home/user/frequency-web'
const face = (fam: string, f: string, style = 'normal', w = '100 900') => `@font-face{font-family:"${fam}";src:url("file://${ROOT}/app/fonts/${f}") format("woff2");font-style:${style};font-weight:${w}}`
const FACES = face('Unbounded', 'unbounded/unbounded.woff2', 'normal', '200 900') + face('Hanken Grotesk', 'hanken-grotesk/hanken-grotesk.woff2') + face('Instrument Serif', 'instrument-serif/instrument-serif-italic.woff2', 'italic', '400')
// One real New World photo per kit (lib/sites/new-world-photos.json slots), as an owner would add one: the hero's picture on the Website and the Spotlight.
const PHOTO: Record<string, string> = { general: 'circle-sunrise', coaches: 'beach-move', studios: 'backyard-class', hosts: 'garden-picnic', venues: 'hands-up', nonprofits: 'workshop-table', networks: 'cafe-table' }
const pub = (html: string) => html.replace(/ loading="lazy"/g, '').replace(/(src|href)="\/(sites|brand|themes)\//g, `$1="file://${ROOT}/public/$2/`)

it('renders the New World Website, Spotlight and Email for each kit', async () => {
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
  const { NEW_WORLD_KIT_NICHES } = await import('@/lib/sites/kits/new-world-variants')
  const { newWorldKitSpotlightContent } = await import('@/lib/spotlight/new-world-kit-content')
  const { NewWorldKitSpotlightLayout } = await import('@/components/spotlight/new-world-kit-layouts')
  const photos = (await import('@/lib/sites/new-world-photos.json')).default as Record<string, { alt: string }>
  const { newWorldKitEmail, newWorldKitEmailFrom, NEW_WORLD_EMAIL_TIDE } = await import('@/lib/theme/new-world-kit-email')

  const accent = Object.entries(newWorldAccentVars(null)).map(([k, v]) => `${k}:${v}`).join(';')
  for (const niche of NEW_WORLD_KIT_NICHES) {
    const kit = (await loadKit(`new-world-${niche}`))!
    const r = applyKit({ theme: 'NewWorld', pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
    if (!r.ok) throw new Error(r.error)
    const home = r.snapshot.pages.find((p) => p.slug === 'home' || p.slug === '') ?? r.snapshot.pages[0]!
    const photo = PHOTO[niche]!
    const c = newWorldKitSpotlightContent(niche, { photo: `/sites/new-world/photos/${photo}.webp` })
    for (const b of home.doc.content as { type: string; props: Record<string, unknown> }[]) {
      if (b.type === 'ServicesHero' || b.type === 'NewWorldHero') { b.props.image = `/sites/new-world/photos/${photo}.webp`; b.props.alt = photos[photo]!.alt }
    }
    const body = h('div', { style: { ['--x' as string]: 0 } }, h(BlockRender, { config, data: home.doc } as never))
    const site = renderToStaticMarkup(
      h(
        SiteChrome as never,
        {
          brandName: c.name,
          homeHref: '/',
          links: [{ label: 'Ways in', href: '/services' }, { label: 'Our story', href: '/about' }, { label: 'Book', href: '/booking' }],
          cta: { href: '/book', label: c.cta.label, external: false },
          themeFonts: false,
          skin: { theme: 'new-world', season: 'fall', register: 'night' },
          tagline: null,
          seasonNow: null,
          footer: { columns: [], blurb: c.descriptor, line: null, note: null, copyright: null, suffix: null, subscribe: null, utility: null },
          credit: 'badge',
          spaceSlug: null,
          previewMega: null,
        } as never,
        body,
      ),
    )
    writeFileSync(`${out}/${niche}-site.html`, pub(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${FACES}${HOUSE_CSS}${FREQUENCY_PAGE_CSS}${NEW_WORLD_CSS}*,*::before,*::after{box-sizing:border-box}body{margin:0}[data-house-theme="new-world"]{${accent}}</style></head><body>${site}</body></html>`))

    const spot = renderToStaticMarkup(h(NewWorldKitSpotlightLayout as never, { layout: `new-world-kit:${c.defaultLayout}`, content: c, register: 'night' }))
    writeFileSync(`${out}/${niche}-spot.html`, pub(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${FACES}*,*::before,*::after{box-sizing:border-box}body{margin:0}[data-house-theme="new-world"]{--nw-font-display:Unbounded,'Hanken Grotesk',sans-serif;--nw-font-body:'Hanken Grotesk',sans-serif;--nw-font-accent:'Instrument Serif',Georgia,serif;--nw-font-mono:Unbounded,sans-serif}</style></head><body>${spot}</body></html>`))

    if (niche === 'general') {
      for (const layout of c.layouts.length ? ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile'] : []) {
        const lc = newWorldKitSpotlightContent(niche)
        const l = renderToStaticMarkup(h(NewWorldKitSpotlightLayout as never, { layout: `new-world-kit:${layout}`, content: lc, register: 'night' }))
        writeFileSync(`${out}/layout-${layout}.html`, pub(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${FACES}*,*::before,*::after{box-sizing:border-box}body{margin:0}[data-house-theme="new-world"]{--nw-font-display:Unbounded,'Hanken Grotesk',sans-serif;--nw-font-body:'Hanken Grotesk',sans-serif;--nw-font-accent:'Instrument Serif',Georgia,serif;--nw-font-mono:Unbounded,sans-serif}</style></head><body>${l}</body></html>`))
      }
    }

    const k = newWorldKitEmailFrom(c)
    const mail = newWorldKitEmail('welcome', { ...k.brand, accent: NEW_WORLD_EMAIL_TIDE, register: 'night', siteUrl: 'https://example.com', siteLabel: 'example.com', unsubscribeUrl: 'https://example.com/unsubscribe' }, k.facts)
    writeFileSync(`${out}/${niche}-email.html`, mail.html)
  }
})
