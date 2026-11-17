import { describe, it, expect, vi, beforeEach } from 'vitest'

// No model is ever called: the one seam to the provider is mocked, and each test hands it the tool_use block a model
// would have returned. The save_items reply is read through a schema (PROG-E8C); these drive it with a valid reply
// and with malformed ones, through the real call path.
const mocks = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('@/lib/ai/complete', () => ({ completeRaw: mocks.complete }))
vi.mock('@/lib/ai/client', () => ({ aiEnabled: () => true }))
vi.mock('@/lib/ai/usage', () => ({ aiAvailable: async () => true, featureOverBudget: async () => false }))
vi.mock('@/lib/ai/voice', () => ({ withVoice: (s: string) => s }))

import { classifyAndExtract } from './extract'
import type { WhatsAppMessage } from './types'

const MESSAGES = [{ ref: 1, timestamp: '', rawTimestamp: '', author: 'Ana', text: 'Sound bath Friday', system: false }] as WhatsAppMessage[]

/** Read one save_items reply through the real call path. */
async function read(input: unknown) {
  mocks.complete.mockResolvedValueOnce({ content: [{ type: 'tool_use', id: 't', name: 'save_items', input }] })
  return (await classifyAndExtract(MESSAGES)).items
}

beforeEach(() => mocks.complete.mockReset())

describe('the save_items reply', () => {
  it('stages a valid event and a valid housing post, with contacts lifted off the housing copy', async () => {
    const items = await read({
      items: [
        { refs: [1, 2.4, 2, 'x', -1], category: 'event', confidence: 'low', note: ' a gathering ', event: { title: 'Sound Bath', startsAt: '2027-03-01', priceCents: 1500, domain: 'body' } },
        { refs: [3], category: 'housing', note: 'room', housing: { title: 'Room in Mission', description: 'Email me@x.com', listingType: 'sublet', roomType: 'private_room', rentCents: 120000.4, bedrooms: 2, city: 'SF' } },
      ],
    })
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ refs: [1, 2], category: 'event', confidence: 'low', note: 'a gathering', imageNames: [] })
    expect(items[0].event).toMatchObject({ title: 'Sound Bath', startsAt: '2027-03-01T00:00:00.000Z', priceCents: 1500, domain: 'body' })
    expect(items[1].confidence).toBe('high')
    expect(items[1].housing).toMatchObject({ title: 'Room in Mission', listingType: 'sublet', roomType: 'private_room', rentCents: 120000, bedrooms: 2, city: 'SF', neighborhood: '', contacts: ['me@x.com'] })
    expect(items[1].housing?.description).not.toContain('me@x.com')
  })

  it('yields no items for a reply that is not the declared shape, without throwing', async () => {
    for (const junk of [undefined, null, 'nope', 7, [], {}, { items: 'three' }, { items: { 0: {} } }]) expect(await read(junk)).toEqual([])
  })

  it('drops the rows it cannot use and keeps the good one', async () => {
    const items = await read({
      items: [
        null,
        'junk',
        42,
        { refs: [9], category: 'event', event: { description: 'no title' } }, // an event the model could not name
        { refs: [9], category: 'housing', housing: 'a nice room' }, // housing with no housing object
        { refs: [9], category: 'roommate' }, // a shell with neither title nor description
        { refs: 'seven', category: 'made-up', confidence: 3, note: 12 }, // unknown category reads as other
        { refs: [5], category: 'roommate', housing: { description: 'Looking for a room', listingType: 'castle', roomType: 7, rentCents: '900', bedrooms: -1 } },
      ],
    })
    expect(items).toEqual([
      { refs: [], category: 'other', confidence: 'high', note: '', imageNames: [] },
      {
        refs: [5],
        category: 'roommate',
        confidence: 'high',
        note: '',
        imageNames: [],
        housing: { title: '', description: 'Looking for a room', listingType: 'roommate', roomType: null, rentCents: null, bedrooms: null, neighborhood: '', city: '', availableFrom: '', contacts: [] },
      },
    ])
  })

  it('skips a batch whose call throws', async () => {
    mocks.complete.mockRejectedValueOnce(new Error('boom'))
    expect((await classifyAndExtract(MESSAGES)).items).toEqual([])
  })
})
