// FIXTURE RENDER: the Domain and DNS card on Manage > Profile & Settings, written to $RENDER_OUT/domain-<state>.html.
// States: none (nothing connected), pending (domain added, DNS records to set). The real SpaceDomainFeature and SiteDomainPanel on the
// app's compiled CSS; only hosting reads, pricing gates and server actions are stubbed.
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/space-domain.render.tsx
import { createElement as h } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

const state = vi.hoisted(() => ({ domain: null as string | null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('@/lib/pricing/gates', () => ({ featureAllowed: async () => true }))
vi.mock('@/lib/pricing/settings', () => ({ featureGatesLive: async () => true }))
vi.mock('@/lib/sites/domain-purchase', () => ({ domainPurchaseOpen: async () => false }))
vi.mock('@/lib/sites/vercel-domains', () => ({
  siteDomainStatus: async (domain: string) => ({
    attached: true, verified: true, dnsReady: false, secure: false, provider: 'GoDaddy', providerIsVercel: false,
    records: [{ type: 'A', name: '@', value: '76.76.21.21' }, { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' }].map((r) => ({ ...r, domain })),
  }),
}))
vi.mock('@/app/(main)/spaces/[slug]/manage/layout/actions', () => ({ connectSiteDomain: async () => ({}), checkSiteDomain: async () => ({}), removeSiteDomain: async () => ({}), domainConnectLink: async () => ({}) }))
vi.mock('@/lib/spaces/website', () => ({ readWebsitePublished: () => true, readSiteHero: () => null }))
vi.mock('@/lib/sites/domain-setup', () => ({ readSiteDomainCandidate: () => state.domain }))

const out = process.env.RENDER_OUT
async function page(inner: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(inner as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div data-kit="members" class="fq-members"><main style="max-width:760px;margin:0 auto;padding:24px 16px">${Buffer.concat(chunks).toString()}</main></div></body></html>`
}

it('renders the Domain and DNS card', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { SpaceDomainFeature } = await import('@/components/sites/space-website-feature')
  for (const [name, domain] of [['none', null], ['pending', 'freehumanmovement.com']] as const) {
    state.domain = domain
    const el = await SpaceDomainFeature({ space: { slug: 'free-human-movement', plan: 'collective', domain: null, preferences: {} } })
    writeFileSync(`${out}/domain-${name}.html`, await page(el))
  }
})
