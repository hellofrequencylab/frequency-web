import { describe, it, expect, vi, beforeEach } from 'vitest'

// No model is ever called: the one seam to the provider is mocked, and each test hands it the tool_use block a model
// would have returned. The save_business_profile input is read through a schema before it is grounded (PROG-E8C);
// these drive the real call path with a valid reply and with malformed ones.
const mocks = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('@/lib/ai/complete', () => ({ completeRaw: mocks.complete }))
vi.mock('@/lib/ai/client', () => ({ aiEnabled: () => true }))
vi.mock('@/lib/ai/usage', () => ({ featureOverBudget: async () => false }))
vi.mock('@/lib/ai/voice', () => ({ withVoice: (s: string) => s }))

import { extractProfile } from './run'
import { readRawExtraction } from './reply'
import type { HarvestedSource } from '../intake'

const sources: HarvestedSource[] = [
  { id: 's1', kind: 'page', url: 'https://acme.test/', fetchedAt: 'now', title: 'Acme', text: 'Acme Coffee is at 123 Main St, open 9 to 5. Call 555-1212. Drip coffee $4.' },
]
const cited = (value: string, snippet = value) => ({ value, snippet, sourceUrl: 'https://acme.test/', kind: 'fact', confidence: 0.9 })

/** Read one save_business_profile reply through the real call path. */
async function extract(input: unknown) {
  mocks.complete.mockResolvedValueOnce({ costUsd: 0.01, content: [{ type: 'tool_use', id: 't', name: 'save_business_profile', input }] })
  return extractProfile({ sources, hints: { name: 'Hint' } })
}

beforeEach(() => mocks.complete.mockReset())

describe('the save_business_profile reply', () => {
  it('turns a valid reply into a grounded draft and ledger', async () => {
    const res = await extract({
      name: cited('Acme Coffee'),
      type: 'business',
      contact: { address: cited('123 Main St'), phone: cited('555-1212'), socials: [{ platform: 'Instagram', url: 'https://ig.test/acme' }] },
      offerings: [{ title: { value: 'Drip coffee' }, price: cited('$4', 'Drip coffee $4'), priceModel: 'fixed', currency: 'usd', durationMinutes: 5 }],
    })
    expect(res?.costUsd).toBe(0.01)
    expect(res?.draft).toEqual({
      name: 'Acme Coffee',
      type: 'business',
      contact: { address: '123 Main St', phone: '555-1212', socials: [{ platform: 'instagram', url: 'https://ig.test/acme' }] },
      offerings: [{ title: 'Drip coffee', price: 4, currency: 'USD', priceModel: 'fixed', durationMinutes: 5 }],
    })
    expect(res?.ledger['contact.phone']?.[0]).toMatchObject({ kind: 'fact', snippet: '555-1212' })
    expect(res?.ledger['offerings[0].price']?.[0].kind).toBe('fact')
  })

  it('returns null, the failed-call path, for a reply that is not an object', async () => {
    for (const junk of [null, undefined, 'nope', 7, []]) expect(await extract(junk)).toBeNull()
  })

  it('reads a wrong-typed part as absent instead of losing the whole extraction', async () => {
    const res = await extract({
      name: cited('Acme Coffee'),
      brandName: { value: 42 },
      type: 9,
      category: 'cafe',
      contact: { address: cited('123 Main St'), phone: { value: 5551212, snippet: 3 }, email: null, socials: [null, 'x', { platform: 7, url: 'u' }] },
      rating: 'five stars',
      offerings: [null, { title: { value: 'Drip coffee', snippet: 9, sourceUrl: 3 }, price: { value: 4 }, durationMinutes: 'ten' }],
      faq: 'none',
      events: [7],
      links: { platform: 'x' },
    })
    expect(res?.draft).toEqual({ name: 'Acme Coffee', type: 'business', contact: { address: '123 Main St' }, offerings: [{ title: 'Drip coffee' }] })
    expect(res?.ledger['contact.phone']).toBeUndefined()
  })
})

describe('readRawExtraction', () => {
  it('passes a well-formed input through unchanged and strips what it was not asked for', () => {
    expect(readRawExtraction({ name: { value: 'Acme', kind: 'fact' }, faq: [{ q: 'Q', a: 'A' }], surprise: true })).toEqual({ name: { value: 'Acme', kind: 'fact' }, faq: [{ q: 'Q', a: 'A' }] })
  })
  it('is null for anything that is not an object, and never throws', () => {
    for (const junk of [null, undefined, 'x', 1, true, []]) expect(readRawExtraction(junk)).toBeNull()
  })
})
