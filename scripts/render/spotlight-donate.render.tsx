// FIXTURE RENDER: a Space Spotlight with and without the Donate card, to $RENDER_OUT/spotlight-donate-<view>.html.
// Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/spotlight-donate.render.tsx
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'
import type { Space } from '@/lib/spaces/types'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/spaces/studio/spotlight', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
vi.mock('@/lib/spaces/donations', () => ({
  getDonationAsk: async () => ({ id: 'a1', fundLabel: 'Keep the studio open', description: 'Rent, tea and a floor that stays sprung.', suggestedAmountsCents: [1000, 2500, 5000], isActive: true }),
}))
vi.mock('@/lib/billing/space-donation-checkout', () => ({ spaceCanTakeDonations: async () => true }))
vi.mock('@/lib/billing/donation-actions', () => ({ startSpaceDonationCheckout: async () => null, settleDonationAction: async () => null }))
vi.mock('@/lib/spaces/analytics-actions', () => ({ recordSpaceCtaClickAction: async () => null }))
vi.mock('@/lib/spaces/cta-click-token', () => ({ createSpaceCtaClickToken: () => 'tok' }))
vi.mock('@/lib/billing/stripe-browser', () => ({ warmStripeBrowser: () => undefined }))

const out = process.env.RENDER_OUT

async function html(el: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString()
}
const page = (body: string) =>
  `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body>${body}</body></html>`

it('renders the Space Spotlight, before and after', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { SpotlightAccent, SpotlightHeader } = await import('@/components/spotlight/space-spotlight')
  const { DonateBlock } = await import('@/components/widgets/space-profile/donate')
  const space = { id: 's1', slug: 'studio', name: 'Studio North', brandName: 'Studio North', brandLogoUrl: null, brandAccent: null, type: 'studio', preferences: {} } as unknown as Space
  const context = { id: 's1', slug: 'studio' } as unknown as SpaceProfileContext
  for (const view of ['current', 'proposed'] as const) {
    const donate = view === 'proposed' ? await DonateBlock({ space: context }) : null
    const el = (
      <SpotlightAccent space={space}>
        <div className="min-h-screen bg-canvas">
          <main className="mx-auto max-w-xl px-4 pb-16">
            <SpotlightHeader space={space} tagline="Movement and breath, North County" />
            <div className="mt-8 space-y-6">{donate}</div>
          </main>
        </div>
      </SpotlightAccent>
    )
    writeFileSync(`${out}/spotlight-donate-${view}.html`, page(await html(el)))
  }
})
