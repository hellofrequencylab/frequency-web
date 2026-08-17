import { describe, it, expect } from 'vitest'
import { classifyRedemption } from './fulfillment'

// ⚠️ THIS FILE CHANGED SHAPE FOR LIVE-013, and the change is the point. The old expectations
// asserted that `{ type: 'border', value: 'aurora' }` classifies as a delivered cosmetic. It
// does not, and never did: there is no "aurora" border, there was no border render at all, and
// treating an unpaintable value as delivered is exactly how a member paid 750 Gems for a title
// that appeared nowhere. "Deliverable" now means the render registry can paint it.

describe('classifyRedemption — never charge Gems for what we cannot deliver (ADR-280, LIVE-013)', () => {
  it('applies a cosmetic instantly when the registry can paint it', () => {
    // The seeded border values are `ring-<colour>-500` shaped; the registry normalises them.
    expect(classifyRedemption({ type: 'border', value: 'ring-indigo-500' })).toEqual({
      kind: 'cosmetic',
      cosmeticType: 'border',
      value: 'ring-indigo-500',
    })
    expect(classifyRedemption({ type: 'flair', value: 'flame' })).toEqual({
      kind: 'cosmetic',
      cosmeticType: 'flair',
      value: 'flame',
    })
    // Titles are free text (the SKU carries the words), so any bounded string paints.
    expect(classifyRedemption({ type: 'title', value: 'Trailblazer' })).toEqual({
      kind: 'cosmetic',
      cosmeticType: 'title',
      value: 'Trailblazer',
    })
  })

  it('REFUSES a cosmetic whose value nothing renders (the LIVE-013 silent loss)', () => {
    // A plausible-looking border that no registry row paints. "pending" would be a lie: no
    // operator can hand-deliver a profile border.
    expect(classifyRedemption({ type: 'border', value: 'aurora' })).toEqual({ kind: 'undeliverable' })
    expect(classifyRedemption({ type: 'flair', value: '✨' })).toEqual({ kind: 'undeliverable' })
    // A title longer than a chip can carry.
    expect(classifyRedemption({ type: 'title', value: 'x'.repeat(80) })).toEqual({ kind: 'undeliverable' })
    // A cosmetic type with no value at all.
    expect(classifyRedemption({ type: 'border' })).toEqual({ kind: 'undeliverable' })
  })

  it('REFUSES an untyped SKU in a category that promises a visible profile change', () => {
    // The five live shelf rows that carried metadata `{}` and fell through to "pending".
    expect(classifyRedemption({}, { slug: 's1-flair-set', category: 'cosmetic' })).toEqual({ kind: 'undeliverable' })
    expect(classifyRedemption({}, { slug: 'animated-banner', category: 'cosmetic' })).toEqual({ kind: 'undeliverable' })
    expect(classifyRedemption({}, { slug: 'callsign-plate', category: 'cosmetic' })).toEqual({ kind: 'undeliverable' })
    expect(classifyRedemption({}, { slug: 'custom-title-slot', category: 'title' })).toEqual({ kind: 'undeliverable' })
  })

  it('delivers a bridged SKU whose metadata never got a type (waveform-border)', () => {
    expect(
      classifyRedemption({ s1_exclusive: true }, { slug: 'waveform-border', category: 'cosmetic' }),
    ).toEqual({ kind: 'cosmetic', cosmeticType: 'border', value: 'waveform' })
  })

  it('lets applied metadata win over the slug bridge', () => {
    expect(
      classifyRedemption({ type: 'border', value: 'ring-violet-500' }, { slug: 'waveform-border', category: 'cosmetic' }),
    ).toEqual({ kind: 'cosmetic', cosmeticType: 'border', value: 'ring-violet-500' })
  })

  it('REFUSES membership billing credits (the silent-loss bug it guards) — type membership + months', () => {
    // The seeded membership-1mo / membership-3mo SKUs.
    expect(classifyRedemption({ type: 'membership', months: 1 })).toEqual({ kind: 'refuse' })
    expect(classifyRedemption({ type: 'membership', months: 3 })).toEqual({ kind: 'refuse' })
  })

  it('treats operator-honored perks as pending (the redemption row is the record)', () => {
    // A membership-category perk WITHOUT a months count (e.g. the guest pass: metadata {}).
    expect(classifyRedemption({}, { slug: 'guest-pass', category: 'membership' })).toEqual({ kind: 'pending' })
    expect(classifyRedemption({ type: 'membership' })).toEqual({ kind: 'pending' })
    // A feature SKU (Listening Room seat, Name a Node, …) carries no cosmetic/credit type.
    expect(classifyRedemption({ s1_exclusive: true }, { slug: 'listening-room-seat', category: 'feature' })).toEqual({ kind: 'pending' })
    expect(classifyRedemption({ type: 'feature' })).toEqual({ kind: 'pending' })
    // A collectible's promise is the chip in the member's collection, which already renders.
    expect(classifyRedemption({ type: 'collectible', badge: 'pioneer' }, { slug: 'badge-pioneer', category: 'collectible' })).toEqual({ kind: 'pending' })
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
