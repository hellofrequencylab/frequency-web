// FIXTURE RENDER: the in-rail Layout builder's save-error region at the Spotlight block cap, to
// $RENDER_OUT/spotlight-cap-<view>.html. current = the red error line; proposed = the calm Crew panel
// (member at 12), plus proposed-crew (Crew at 40).
// Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/spotlight-cap.render.tsx
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/people/ada' }))
vi.mock('@/app/(main)/upgrade/actions', () => ({ startMembershipCheckout: async () => ({ error: 'fixture' }), settleMembershipCheckoutAction: async () => ({}) }))
vi.mock('@/components/billing/checkout-panel', () => ({ default: () => null }))
vi.mock('@/components/analytics/track-provider', () => ({ trackClient: () => {} }))
vi.mock('@/lib/billing/stripe-browser', () => ({ warmStripeBrowser: () => {} }))

const out = process.env.RENDER_OUT

async function html(el: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString()
}
const page = (body: string) =>
  `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body class="bg-surface-elevated"><main class="mx-auto max-w-[var(--rail-w,22rem)] p-4 sm:p-6"><section class="space-y-3 rounded-card border border-border bg-surface p-4" aria-label="Profile page builder"><header class="flex items-center justify-between"><h2 class="text-body-sm font-semibold text-text">Layout</h2><span class="text-meta text-muted">12 of 12 blocks</span></header>${body}<ul class="space-y-2 text-body-sm text-text"><li class="rounded-control border border-border px-3 py-2">About</li><li class="rounded-control border border-border px-3 py-2">Links</li><li class="rounded-control border border-border px-3 py-2">Gallery</li></ul></section></main></body></html>`

const member = { used: 12, allowed: 12, crewAllowed: 40, presetCents: [500, 1000, 2500], suggestedCents: 1000, minCents: 499 }

it('renders the cap region, current and proposed', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { SaveErrorOrCapPanel } = await import('@/components/entity-blocks/spotlight-cap-panel')
  const { SPOTLIGHT_BLOCKS_MESSAGE } = await import('@/lib/spotlight/caps')
  const views = {
    current: createElement(SaveErrorOrCapPanel, { error: SPOTLIGHT_BLOCKS_MESSAGE, capReached: null }),
    proposed: createElement(SaveErrorOrCapPanel, { error: SPOTLIGHT_BLOCKS_MESSAGE, capReached: member }),
    'proposed-crew': createElement(SaveErrorOrCapPanel, { error: SPOTLIGHT_BLOCKS_MESSAGE, capReached: { ...member, used: 40, allowed: 40 } }),
  }
  for (const [name, el] of Object.entries(views)) writeFileSync(`${out}/spotlight-cap-${name}.html`, page(await html(el)))
})
