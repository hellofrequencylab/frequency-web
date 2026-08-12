import { describe, it, expect } from 'vitest'
import { canOfferCircle } from './handoff'

// The pure offer gate (ADR-845). Source authority only: an offer changes nothing on its own, so
// the destination's agreement is collected by the accept step rather than checked here.

const base = {
  viewerProfileId: 'me',
  sourceSpaceCanEdit: true,
  currentHostId: 'host-1',
  toProfileId: 'someone-else',
  staff: false,
  linkedTierCount: 0,
}

describe('canOfferCircle', () => {
  it('lets a space steward offer their space circle away', () => {
    expect(canOfferCircle(base).allowed).toBe(true)
  })

  it('lets a personal circle host offer it away', () => {
    expect(
      canOfferCircle({ ...base, sourceSpaceCanEdit: false, currentHostId: 'me' }).allowed,
    ).toBe(true)
  })

  it('refuses someone who owns neither side of it', () => {
    const d = canOfferCircle({ ...base, sourceSpaceCanEdit: false, currentHostId: 'other' })
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('owns this circle')
  })

  it('refuses offering it to yourself, which is the immediate move instead', () => {
    const d = canOfferCircle({ ...base, toProfileId: 'me' })
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('already yours')
  })

  it('refuses offering to yourself even as staff, so no offer sits waiting on its own sender', () => {
    expect(canOfferCircle({ ...base, toProfileId: 'me', staff: true }).allowed).toBe(false)
  })

  it('admits platform staff on a circle they neither host nor steward', () => {
    expect(
      canOfferCircle({
        ...base,
        viewerProfileId: 'operator',
        sourceSpaceCanEdit: false,
        currentHostId: 'other',
        staff: true,
      }).allowed,
    ).toBe(true)
  })

  it('refuses anonymous callers, staff flag or not', () => {
    expect(canOfferCircle({ ...base, viewerProfileId: null }).allowed).toBe(false)
    expect(canOfferCircle({ ...base, viewerProfileId: null, staff: true }).allowed).toBe(false)
  })
})

// THE TIER LOCK (see lib/circles/transfer.test.ts). An accepted offer runs the same ownership
// write, so the same pin applies here: a circle a Space is minting paid-member rows into may not be
// offered away while the link stands. Refusing at OFFER time beats a recipient accepting something
// that cannot complete. Fails on the pre-guard tree, where every case below was allowed.
describe('canOfferCircle: the tier lock (cross-tenant membership leak)', () => {
  it('refuses to offer away a circle a membership tier is linked to', () => {
    const d = canOfferCircle({ ...base, linkedTierCount: 1 })
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('linked to a membership tier')
  })

  it('refuses for platform staff too: it is an integrity rule, not a permission', () => {
    expect(canOfferCircle({ ...base, staff: true, linkedTierCount: 1 }).allowed).toBe(false)
  })

  it('allows the offer once the operator unlinks', () => {
    expect(canOfferCircle({ ...base, linkedTierCount: 0 }).allowed).toBe(true)
  })
})
