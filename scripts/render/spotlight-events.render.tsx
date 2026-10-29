// FIXTURE RENDER: the public Spotlight with and without upcoming events, to $RENDER_OUT/spotlight-events-<view>.html.
// Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/spotlight-events.render.tsx
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'
import type { SpotlightData } from '@/lib/spotlight/data'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/spotlight/ada', useSearchParams: () => new URLSearchParams() }))
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

const events = [
  { id: 'e1', slug: 'sunrise-sit', title: 'Sunrise sit at Bird Rock', starts_at: '2026-11-07T14:15:00Z' },
  { id: 'e2', slug: 'full-moon-circle', title: 'Full Moon Circle', starts_at: '2026-11-14T02:00:00Z' },
  { id: 'e3', slug: 'breathwork-night', title: 'Breathwork night', starts_at: '2026-11-21T03:00:00Z' },
]

it('renders the public Spotlight, before and after', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { SpotlightShell } = await import('@/components/spotlight/spotlight-shell')
  const { MemberProfileModules } = await import('@/components/widgets/member-profile/member-profile-modules')
  const { publicSpotlightGrid } = await import('@/lib/spotlight/public-grid')
  const { member } = await import('@/components/widgets/member-profile/member-profile-modules.fixture')
  const { EMPTY_THEME } = await import('@/lib/spotlight/theme')
  for (const view of ['current', 'proposed'] as const) {
    const base = member()
    const data = { ...base, theme: EMPTY_THEME, stickers: { items: [] }, hostedEvents: view === 'proposed' ? events : [] } as unknown as SpotlightData
    const el = (
      <SpotlightShell data={data} showJoinCta showBio={false}>
        <MemberProfileModules member={data} grid={publicSpotlightGrid(data.grid, data.layout.blocks)} />
      </SpotlightShell>
    )
    writeFileSync(`${out}/spotlight-events-${view}.html`, page(await html(el)))
  }
})
