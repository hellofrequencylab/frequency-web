// FIXTURE RENDER: the Free Human Movement Space Spotlight's header and its own (content) blocks, on the Spotlight's themed accent, to
// $RENDER_OUT/fh-spotlight.html. The data blocks (about, link cards, events) read the Space's own rows and are not drawn here.
// Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/free-human-spotlight.render.tsx
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'
import type { Space } from '@/lib/spaces/types'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string, className: p.className as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/spotlight', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))

const out = process.env.RENDER_OUT

async function html(el: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString()
}

it('renders the Free Human Movement Space Spotlight', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { SpotlightAccent, SpotlightHeader } = await import('@/components/spotlight/space-spotlight')
  const { ContentBlockView } = await import('@/components/entity-blocks/content-block-view')
  const { FREE_HUMAN_SPACE, freeHumanSpotlight } = await import('@/lib/sites/free-human-site')
  const { planMegaTheme } = await import('@/lib/theme/apply-mega-theme')
  const content = freeHumanSpotlight().layout.content as Record<string, Record<string, unknown>>
  const space = { id: 's1', slug: 'freehumanmovement', name: FREE_HUMAN_SPACE.name, brandName: FREE_HUMAN_SPACE.name, brandLogoUrl: FREE_HUMAN_SPACE.logo, brandAccent: '#B3361F', plan: 'business', type: 'business', preferences: planMegaTheme({}, 'free-human') } as unknown as Space
  const el = createElement(SpotlightAccent, { space, children: createElement('div', { className: 'min-h-screen bg-canvas' },
    createElement('main', { className: 'mx-auto max-w-xl px-4 pb-16' },
      createElement(SpotlightHeader, { space, tagline: FREE_HUMAN_SPACE.tagline }),
      ...(['image', 'text', 'button', 'links'] as const).map((id) => createElement('div', { key: id, className: 'mt-6' }, createElement(ContentBlockView, { id, props: content[id] }))),
    )) } as never)
  const page = `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body>${await html(el)}</body></html>`
  writeFileSync(`${out}/fh-spotlight.html`, page.replace(/(src|href)="\/(sites|brand)\//g, '$1="file:///home/user/frequency-web/public/$2/'))
})
