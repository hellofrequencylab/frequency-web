import { describe, expect, it } from 'vitest'
import { pillarZapBalance, type BalancePractice } from './pillar-balance'

// The owner-locked rule made testable: a Journey is balanced only when all four
// Pillars earn the same total daily Zaps. Zaps come from weight class (Light 8 /
// Standard 12 / Heavy 15, lib/zaps.ts). Pure math — pinned here so the indicator and
// the future editor check share one tested source of truth.

const p = (pillar: BalancePractice['pillar'], weightClass: BalancePractice['weightClass']): BalancePractice => ({
  pillar,
  weightClass,
})

describe('pillarZapBalance', () => {
  it('sums each Pillar by weight-class Zaps (Light 8 / Standard 12 / Heavy 15)', () => {
    const b = pillarZapBalance([
      p('mind', 'light'),
      p('mind', 'standard'),
      p('body', 'heavy'),
      p('spirit', 'standard'),
      p('expression', 'heavy'),
    ])
    expect(b.mind).toBe(20) // 8 + 12
    expect(b.body).toBe(15) // heavy
    expect(b.spirit).toBe(12) // standard
    expect(b.expression).toBe(15) // heavy
  })

  it('treats a null/unknown weight class as standard (12)', () => {
    const b = pillarZapBalance([p('mind', null), p('body', undefined), p('spirit', 'mystery')])
    expect(b.mind).toBe(12)
    expect(b.body).toBe(12)
    expect(b.spirit).toBe(12)
  })

  it('is balanced when all four Pillar totals are equal', () => {
    const b = pillarZapBalance([
      p('mind', 'standard'),
      p('body', 'standard'),
      p('spirit', 'standard'),
      p('expression', 'standard'),
    ])
    expect(b.mind).toBe(12)
    expect(b.body).toBe(12)
    expect(b.spirit).toBe(12)
    expect(b.expression).toBe(12)
    expect(b.balanced).toBe(true)
  })

  it('is balanced when each Pillar reaches the same total via different weight classes', () => {
    // Every Pillar reaches 24, but by a different mix of weight classes.
    const b = pillarZapBalance([
      p('mind', 'light'), p('mind', 'light'), p('mind', 'light'), // 8 * 3 = 24
      p('body', 'standard'), p('body', 'standard'), // 12 * 2 = 24
      p('spirit', 'light'), p('spirit', 'light'), p('spirit', 'light'), // 8 * 3 = 24
      p('expression', 'standard'), p('expression', 'standard'), // 12 * 2 = 24
    ])
    expect(b.mind).toBe(24)
    expect(b.body).toBe(24)
    expect(b.spirit).toBe(24)
    expect(b.expression).toBe(24)
    expect(b.balanced).toBe(true)
  })

  it('flags an imbalance when one Pillar is light', () => {
    // The README example: Mind 36 · Body 36 · Spirit 24 · Expression 36 — Spirit is light.
    const b = pillarZapBalance([
      p('mind', 'standard'), p('mind', 'standard'), p('mind', 'standard'), // 36
      p('body', 'standard'), p('body', 'standard'), p('body', 'standard'), // 36
      p('spirit', 'standard'), p('spirit', 'standard'), // 24
      p('expression', 'standard'), p('expression', 'standard'), p('expression', 'standard'), // 36
    ])
    expect(b.mind).toBe(36)
    expect(b.body).toBe(36)
    expect(b.spirit).toBe(24)
    expect(b.expression).toBe(36)
    expect(b.balanced).toBe(false)
  })

  it('treats an empty Journey as trivially balanced (all zero)', () => {
    const b = pillarZapBalance([])
    expect(b).toEqual({ mind: 0, body: 0, spirit: 0, expression: 0, balanced: true })
  })

  it('ignores practices with no Pillar (they count toward no total)', () => {
    const b = pillarZapBalance([p('mind', 'standard'), p(null, 'heavy'), p(undefined, 'heavy')])
    expect(b.mind).toBe(12)
    expect(b.body).toBe(0)
    expect(b.balanced).toBe(false) // mind 12, others 0
  })
})
