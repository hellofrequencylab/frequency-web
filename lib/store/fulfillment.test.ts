import { describe, it, expect } from 'vitest'
import { classifyRedemption } from './fulfillment'

describe('classifyRedemption — never charge Gems for what we cannot deliver (ADR-280)', () => {
  it('applies cosmetics (border / flair / title) instantly', () => {
    expect(classifyRedemption({ type: 'border', value: 'aurora' })).toEqual({
      kind: 'cosmetic',
      cosmeticType: 'border',
    })
    expect(classifyRedemption({ type: 'flair', value: '✨' })).toEqual({
      kind: 'cosmetic',
      cosmeticType: 'flair',
    })
    expect(classifyRedemption({ type: 'title', value: 'Founder' })).toEqual({
      kind: 'cosmetic',
      cosmeticType: 'title',
    })
  })

  it('REFUSES membership billing credits (the silent-loss bug it guards) — type membership + months', () => {
    // The seeded membership-1mo / membership-3mo SKUs.
    expect(classifyRedemption({ type: 'membership', months: 1 })).toEqual({ kind: 'refuse' })
    expect(classifyRedemption({ type: 'membership', months: 3 })).toEqual({ kind: 'refuse' })
  })

  it('treats operator-honored perks as pending (the redemption row is the record)', () => {
    // A membership-category perk WITHOUT a months count (e.g. the guest pass: metadata {}).
    expect(classifyRedemption({})).toEqual({ kind: 'pending' })
    expect(classifyRedemption({ type: 'membership' })).toEqual({ kind: 'pending' })
    // A feature SKU (Listening Room seat, Name a Node, …) carries no cosmetic/credit type.
    expect(classifyRedemption({ s1_exclusive: true })).toEqual({ kind: 'pending' })
    expect(classifyRedemption({ type: 'feature' })).toEqual({ kind: 'pending' })
  })

  it('does not mistake a non-numeric months for a billing credit', () => {
    // Defensive: only a real numeric months count triggers the refuse path.
    expect(classifyRedemption({ type: 'membership', months: 'lots' })).toEqual({ kind: 'pending' })
  })

  it('handles null / undefined / non-object metadata as pending', () => {
    expect(classifyRedemption(null)).toEqual({ kind: 'pending' })
    expect(classifyRedemption(undefined)).toEqual({ kind: 'pending' })
  })
})
