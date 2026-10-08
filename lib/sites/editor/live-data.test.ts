import { beforeEach, describe, expect, it, vi } from 'vitest'
const resolve = vi.hoisted(() => vi.fn())
vi.mock('@/lib/entity-blocks/block-data-sources', () => ({ resolveFeatureSourceItems: resolve }))
import { loadWebsiteFeatures } from './live-data'
describe('website live feature hydration', () => {
  beforeEach(() => { resolve.mockReset().mockResolvedValue([{ title: 'Real event', text: 'Original blurb', price: '$20', link: '/events/real', cta: 'See event' }]) })
  it('reads each source once, maps real rows, and preserves the stored draft', async () => {
    const doc = { root: {}, content: [{ type: 'FeatureGrid', props: { id: 'one', source: 'events', items: [] } }, { type: 'FeatureGrid', props: { id: 'two', source: 'events', items: [] } }, { type: 'FeatureGrid', props: { id: 'custom', source: 'custom', items: [] } }] }
    const before = structuredClone(doc)
    const data = await loadWebsiteFeatures('tenant', [doc])
    expect(resolve).toHaveBeenCalledExactlyOnceWith('events', 'tenant', 12)
    expect(data.one).toEqual([{ title: 'Real event', text: 'Original blurb', price: '$20', body: 'Original blurb\n$20', href: '/events/real' }])
    expect(data.two).toEqual(data.one)
    expect(data.custom).toBeUndefined()
    expect(doc).toEqual(before)
  })
  it('keeps source-specific entries for repeated IDs across independent pages', async () => {
    resolve.mockImplementation(async (source: string) => [{ title: source, text: '', price: '', link: '', cta: '' }])
    const doc = (source: string) => ({ root: {}, content: [{ type: 'FeatureGrid', props: { id: 'reused', source } }] })
    const data = await loadWebsiteFeatures('tenant', [doc('events'), doc('memberships')])
    expect(data[JSON.stringify(['events', 'reused'])][0].title).toBe('events')
    expect(data[JSON.stringify(['memberships', 'reused'])][0].title).toBe('memberships')
  })
  it('supports nested feature blocks and returns an honest empty source on failure', async () => {
    resolve.mockRejectedValue(new Error('offline'))
    const data = await loadWebsiteFeatures('tenant', [{ root: {}, content: [{ type: 'Text', props: { id: 'parent', children: [{ type: 'FeatureGrid', props: { id: 'nested', source: 'memberships' } }] } }] }])
    expect(data.nested).toEqual([])
    expect(data[JSON.stringify(['memberships', 'nested'])]).toEqual([])
  })
})
