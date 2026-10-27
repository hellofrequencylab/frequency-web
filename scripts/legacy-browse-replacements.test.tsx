// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, type ReactNode } from 'react'
import { FqItemGrid } from '@/components/frequency/members/marketplace/item-grid'
import { HelpCenter } from '@/components/frequency/site/pages/help/help-client'
import { FqMarketAreas, FqHiddenAreaNote } from '@/components/frequency/members/marketplace/areas'
import type { MarketArea } from '@/lib/marketplace/visibility'
import { FqEventCard } from '@/components/frequency/members/events/event-card'
import type { EventRow } from '@/app/(main)/events/index-data'
import { BROWSE_REPLACEMENTS } from './lib/retired-browse-wrappers.mjs'
import { replacementMounted, withheldPriceForwarded } from './probes/retired-browse-wrappers.mjs'
const visibility = vi.hoisted(() => ({ flags: { market: true, housing: true, makers: true, shop: false }, operator: false }))
vi.mock('@/lib/marketplace/visibility', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/marketplace/visibility')>()
  return { ...actual, browsableAreas: async () => actual.visibleAreas(visibility.flags, visibility.operator), marketplaceVisibility: async () => visibility.flags, isMarketplaceOperator: async () => visibility.operator }
})
vi.mock('next/navigation', () => ({ usePathname: () => '/classifieds' }))
vi.mock('@/app/(main)/events/index-data', () => ({ formatWhen: () => 'Thursday' }))
vi.mock('@/components/frequency/members/go-button', () => ({ GoButton: () => <button>Go</button> }))
let root: Root | undefined
let host: HTMLDivElement
function mount(node: ReactNode) { host = document.createElement('div'); root = createRoot(host); act(() => root!.render(node)); return host }
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined })
function type(value: string) {
  const input = host.querySelector('input')!
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
describe('actual Frequency browse replacements retain usable journeys', () => {
  it('the active area header renders only published member doors, while operators can see hidden doors', async () => {
    const html = async () => new DOMParser().parseFromString(renderToStaticMarkup(await FqMarketAreas()), 'text/html')
    visibility.operator = false
    expect((await html()).querySelector('a[href="/store"]')).toBeNull()
    expect((await html()).querySelector('a[href="/events?price=paid"]')).not.toBeNull()
    visibility.operator = true
    expect((await html()).querySelector('a[href="/store"]')).not.toBeNull()
    visibility.operator = false
    expect(await FqHiddenAreaNote({ area: 'shop' as MarketArea })).toBeNull()
    visibility.operator = true
    expect(renderToStaticMarkup(await FqHiddenAreaNote({ area: 'shop' }))).toContain('hidden from members')
    visibility.operator = false
  })
  it('classified listings filter locally while retaining the actual detail links', () => {
    const item = (id: string, title: string) => ({ id, title, href: `/classifieds/${id}`, price: 'Free', sub: null, image: null, text: title, cta: 'View' })
    mount(<FqItemGrid sections={[{ title: 'Items', items: [item('chair', 'Chair'), item('bike', 'Bike')] }]} placeholder="Find items" />)
    expect(host.querySelector('a[href="/classifieds/chair"]')).not.toBeNull()
    type('bike')
    expect(host.querySelector('a[href="/classifieds/chair"]')).toBeNull()
    expect(host.querySelector('a[href="/classifieds/bike"]')).not.toBeNull()
  })
  it('help search filters actual article links without deleting topic navigation', () => {
    mount(<HelpCenter topics={[{ slug: 'start', title: 'Start', description: '', articles: [{ title: 'Join a Circle', description: 'Meet neighbors', href: '/help/start/join' }, { title: 'Host an Event', description: 'Invite people', href: '/help/start/host' }] }]} />)
    type('host')
    expect(host.querySelector('a[href="/help/start/join"]')).toBeNull()
    expect(host.querySelector('a[href="/help/start/host"]')).not.toBeNull()
    expect(host.querySelector('nav[aria-label="Help topics"] a[href="#start"]')).not.toBeNull()
  })
  it('the actual event card withholds absent prices and renders eligible labels', () => {
    const e = { id: 'event', slug: 'event', title: 'Event', starts_at: '2026-11-01T18:00:00Z', ends_at: null, capacity: null, recurrence_type: 'none', scope_type: 'public', scope_id: '', attendance_mode: 'in_person', join_mode: 'rsvp', host: null, host_space: null } as unknown as EventRow
    const data = { coverUrls: {}, coverFocus: {}, rsvpCounts: {}, myRsvps: new Set<string>(), nowDate: new Date('2026-10-01'), myProfileId: null, circleNames: {}, priceLabels: { event: null } }
    const doc = (label: string | null) => new DOMParser().parseFromString(renderToStaticMarkup(<FqEventCard e={e} data={{ ...data, priceLabels: { event: label } }} />), 'text/html')
    expect(doc(null).querySelector('.ev-price')).toBeNull()
    expect(doc('Free').querySelector('.ev-price')?.textContent).toContain('Free')
    expect(doc('$20').querySelector('.ev-price')?.textContent).toContain('$20')
  })
  it('actual card source controls reject a Free fallback or unconditional price publishing', () => {
    const source = readFileSync('components/frequency/members/events/event-card.tsx', 'utf8')
    expect(withheldPriceForwarded(source)).toBe(true)
    expect(withheldPriceForwarded(source.replace('const price = priceLabels[e.id]', "const price = priceLabels[e.id] ?? 'Free'"))).toBe(false)
    expect(withheldPriceForwarded(source.replace('{price && (', '{true && ('))).toBe(false)
  })
  it.each(BROWSE_REPLACEMENTS)('the actual $route mount fails when its replacement is removed', ({ route, symbol }) => {
    const source = readFileSync(route, 'utf8')
    expect(replacementMounted(source, symbol, route)).toBe(true)
    expect(replacementMounted(source.replaceAll(`<${symbol}`, '<RetiredMissing'), symbol, route)).toBe(false)
  })
})
