// FIXTURE RENDER: the public Spotlight with and without upcoming events, to $RENDER_OUT/spotlight-programs-<view>.html.
// Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/spotlight-programs.render.tsx
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'
import type { EntityLayout } from '@/lib/entity-blocks/layout'

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

const programs = {
  circles: [
    { id: 'c1', name: 'Dawn Walkers', href: '/circles/dawn-walkers' },
    { id: 'c2', name: 'Sunday Sound Bath', href: '/circles/sunday-sound-bath' },
  ],
  journeys: [
    { id: 'j1', name: 'Thirty Days of Sitting', href: '/journeys/thirty-days', finished: false },
    { id: 'j2', name: 'Cold Water Month', href: '/journeys/cold-water', finished: true },
  ],
  spaces: [{ id: 's1', name: 'Harbor Studio', href: '/spaces/harbor-studio' }],
}
const on = { showCircles: true, showJourneys: true, showSpaces: true }

// Current = block placed with every switch off (the default); proposed = the three switches on.
const withBlock = (_g: unknown, proposed: boolean): EntityLayout => ({
  rows: [
    { id: 'r0', columns: 1 as const, cells: [['about']] },
    { id: 'r1', columns: 1 as const, cells: [['memberPrograms']] },
    { id: 'r2', columns: 1 as const, cells: [['links']] },
  ],
  content: { memberPrograms: proposed ? on : {} },
})

it('renders the public Spotlight, before and after', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { SpotlightShell } = await import('@/components/spotlight/spotlight-shell')
  const { MemberProfileModules } = await import('@/components/widgets/member-profile/member-profile-modules')
  const { publicSpotlightGrid } = await import('@/lib/spotlight/public-grid')
  const { member } = await import('@/components/widgets/member-profile/member-profile-modules.fixture')
  const { EMPTY_THEME } = await import('@/lib/spotlight/theme')
  for (const view of ['current', 'proposed'] as const) {
    const base = member()
    const data = { ...base, theme: EMPTY_THEME, stickers: { items: [] }, programs }
    const modules = createElement(MemberProfileModules, { member: data, grid: publicSpotlightGrid(withBlock(data.grid, view === 'proposed'), data.layout.blocks) })
    const el = createElement(SpotlightShell as never, { data, showJoinCta: true, showBio: false }, modules)
    writeFileSync(`${out}/spotlight-programs-${view}.html`, page(await html(el)))
  }
})
