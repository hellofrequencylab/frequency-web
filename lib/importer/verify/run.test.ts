import { describe, it, expect } from 'vitest'

// The verify orchestrator wires the refuter to the gate. Tested with a MOCK refuter (no model):
// the invariants are that a supported verdict promotes a cited fact to verified+kept, an
// unsupported/absent verdict leaves the fact withheld, and the per-import USD cap stops the fan-out.

import { verify, claimForPath } from './run'
import type { FieldVerdict } from './gate'
import type { BusinessProfile, ProvenanceLedger } from '../schema'
import type { HarvestedSource } from '../intake'

const sources: HarvestedSource[] = [
  { id: 's1', kind: 'page', url: 'https://acme.test', fetchedAt: 'now', text: 'Acme is at 123 Main St. Call 555-1212.' },
]

const draft = (): BusinessProfile => ({
  name: 'Acme',
  type: 'business',
  contact: { address: '123 Main St', phone: '555-1212' },
})

const ledger = (): ProvenanceLedger => ({
  'contact.address': [{ kind: 'fact', confidence: 0.6, snippet: '123 Main St', sourceUrl: 'https://acme.test' }],
  'contact.phone': [{ kind: 'fact', confidence: 0.6, snippet: '555-1212', sourceUrl: 'https://acme.test' }],
})

/** A mock refuter that returns a fixed verdict per path. */
function mockRefuter(verdicts: Record<string, FieldVerdict['verdict']>, costPerCall = 0.1) {
  return async (input: { path: string; claim: string; sourceUrl?: string }) => {
    const v = verdicts[input.path]
    if (!v) return null
    return {
      verdict: {
        path: input.path,
        verdict: v,
        snippet: v === 'supported' || v === 'contradicted' ? 'evidence' : undefined,
        sourceUrl: input.sourceUrl,
        confidence: 0.9,
      } as FieldVerdict,
      costUsd: costPerCall,
    }
  }
}

describe('claimForPath', () => {
  it('resolves each commercial claim from the draft', () => {
    const d = draft()
    expect(claimForPath(d, 'contact.address')).toBe('123 Main St')
    expect(claimForPath(d, 'contact.phone')).toBe('555-1212')
    expect(claimForPath(d, 'contact.email')).toBeNull()
  })

  it('renders a rating and an offering price', () => {
    const d: BusinessProfile = {
      name: 'X',
      type: 'business',
      rating: { value: '4.8', count: '120' },
      offerings: [{ title: 'Latte', price: 5, currency: 'USD', priceModel: 'fixed' }],
    }
    expect(claimForPath(d, 'rating')).toContain('4.8')
    expect(claimForPath(d, 'offerings[0].price')).toContain('5')
  })
})

describe('verify — refuter verdicts drive the verified split', () => {
  it('a supported verdict verifies the cited fact and KEEPS it in the draft', async () => {
    const res = await verify({
      draft: draft(),
      ledger: ledger(),
      sources,
      deps: { refuteField: mockRefuter({ 'contact.address': 'supported', 'contact.phone': 'supported' }) },
    })
    expect(res.verifiedDraft.contact?.address).toBe('123 Main St')
    expect(res.verifiedDraft.contact?.phone).toBe('555-1212')
    expect(res.commercialPolicy).toBe('allow')
    expect(res.ledger['contact.address'][0].verifiedBy).toBe('auto')
    expect(res.fieldsVerified).toBe(2)
  })

  it('an unsupported verdict WITHHOLDS the fact even though the extractor cited it', async () => {
    const res = await verify({
      draft: draft(),
      ledger: ledger(),
      sources,
      deps: { refuteField: mockRefuter({ 'contact.address': 'unsupported', 'contact.phone': 'supported' }) },
    })
    expect(res.verifiedDraft.contact?.address).toBeUndefined() // withheld
    expect(res.verifiedDraft.contact?.phone).toBe('555-1212') // kept
    expect(res.commercialPolicy).toBe('withhold')
  })

  it('a contradicted verdict withholds AND blocks the field', async () => {
    const res = await verify({
      draft: draft(),
      ledger: ledger(),
      sources,
      deps: { refuteField: mockRefuter({ 'contact.address': 'contradicted', 'contact.phone': 'supported' }) },
    })
    expect(res.verifiedDraft.contact?.address).toBeUndefined()
    expect(res.blocked).toContain('contact.address')
  })

  it('a null refuter (AI off) leaves EVERY commercial fact withheld', async () => {
    const res = await verify({
      draft: draft(),
      ledger: ledger(),
      sources,
      deps: { refuteField: async () => null },
    })
    expect(res.verifiedDraft.contact?.address).toBeUndefined()
    expect(res.verifiedDraft.contact?.phone).toBeUndefined()
    expect(res.commercialPolicy).toBe('withhold')
    expect(res.fieldsVerified).toBe(0)
  })

  it('respects the per-import USD cap: stops the fan-out once spent reaches the cap', async () => {
    // Each call costs $0.10; a $0.10 cap permits exactly one field, then the loop stops.
    const res = await verify({
      draft: draft(),
      ledger: ledger(),
      sources,
      maxSpendUsd: 0.1,
      deps: { refuteField: mockRefuter({ 'contact.address': 'supported', 'contact.phone': 'supported' }, 0.1) },
    })
    expect(res.fieldsVerified).toBe(1)
    expect(res.costUsd).toBeCloseTo(0.1, 5)
  })
})
