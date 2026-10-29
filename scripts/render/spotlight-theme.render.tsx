// FIXTURE RENDER: a Space Spotlight on Business with Nocturne vs free, to $RENDER_OUT/spotlight-theme-<view>.html.
// Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/spotlight-theme.render.tsx
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'
import type { Space } from '@/lib/spaces/types'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/spaces/studio/spotlight', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))

const out = process.env.RENDER_OUT

async function html(el: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString()
}
const page = (body: string) =>
  `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body>${body}</body></html>`

it('renders the Space Spotlight, free vs Business themed', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { SpotlightAccent, SpotlightHeader } = await import('@/components/spotlight/space-spotlight')
  const base = { id: 's1', slug: 'studio', name: 'Studio North', brandName: 'Studio North', brandLogoUrl: null, brandAccent: null, type: 'studio', preferences: { megaTheme: { theme: 'midnight' } } }
  for (const view of ['current', 'proposed'] as const) {
    const space = { ...base, plan: view === 'proposed' ? 'business' : 'free' } as unknown as Space
    const el = (
      <SpotlightAccent space={space}>
        <div className="min-h-screen bg-canvas">
          <main className="mx-auto max-w-xl px-4 pb-16">
            <SpotlightHeader space={space} tagline="Movement and breath, North County" />
            <div className="mt-8 rounded-card border border-border bg-raised p-4 text-text">Join the Thursday class<p className="text-muted">Booking opens Monday</p></div>
          </main>
        </div>
      </SpotlightAccent>
    )
    writeFileSync(`${out}/spotlight-theme-${view}.html`, page(await html(el)))
  }
})
