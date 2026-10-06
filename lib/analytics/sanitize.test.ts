import { describe, it, expect } from 'vitest'
import { pixelSafePath, pixelSafeProps, sanitizeProps } from './sanitize'

// Locks the prop-bag allowlist. The bag is built from attacker-influenced KEY names as well
// as values, so the key tests matter as much as the value ones.

describe('sanitizeProps', () => {
  it('keeps primitives and drops everything else', () => {
    expect(sanitizeProps({ a: 'x', b: 2, c: true, d: null, e: {}, f: [] })).toEqual({
      a: 'x',
      b: 2,
      c: true,
    })
  })

  it('caps key count and string length', () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]))
    expect(Object.keys(sanitizeProps(many)).length).toBe(20)
    expect(sanitizeProps({ s: 'x'.repeat(900) }).s).toHaveLength(500)
  })

  it('only writes keys that match the identifier allowlist', () => {
    // Machinery keys fall out as a side effect of the allowlist, not as a special case.
    const out = sanitizeProps(JSON.parse('{"__proto__":"x","constructor":"y","ok":"z"}'))
    expect(out).toEqual({ ok: 'z' })
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
  })

  it('accepts the key shapes real callers actually pass', () => {
    // Taken from live call sites: track('circle.joined', { circleId }), observe('dwell',
    // { ms, path }), track('profile.completed', { hasAvatar }). If the allowlist ever
    // rejects one of these it is too tight and analytics silently loses a column.
    const real = { circleId: 'c1', practiceId: 'p1', hasAvatar: true, path: '/x', pct: 50, ms: 12, medium: 'qr' }
    expect(sanitizeProps(real)).toEqual(real)
  })

  it('rejects keys that no caller of ours would produce', () => {
    const out = sanitizeProps({ 'a b': 1, '9lives': 2, '': 3, ['x'.repeat(60)]: 4, ok: 5 })
    expect(out).toEqual({ ok: 5 })
  })

  it('treats non-objects as an empty bag', () => {
    for (const v of [null, undefined, 'str', 7, true]) expect(sanitizeProps(v)).toEqual({})
  })
})

// LIVE-810: what a pixel may see. Persona, archetype and topics never leave; slugs that name
// a Journey, Circle or topic are redacted from every path.
describe('pixelSafeProps', () => {
  it('drops persona, archetype, topic and mood keys, case-insensitively', () => {
    const out = pixelSafeProps({
      feature: 'onboarding_persona_select',
      persona: 'builder',
      Personas: 'builder,visitor',
      archetype: 'wired_professional',
      topic: 'grief',
      mood: 'low',
      count: 2,
    })
    expect(out).toEqual({ feature: 'onboarding_persona_select', count: 2 })
  })

  it('redacts slugs in path-shaped values and keeps the origin of full URLs', () => {
    expect(pixelSafeProps({ path: '/journeys/grief-walks/day-2' })).toEqual({
      path: '/journeys/[slug]/day-2',
    })
    expect(pixelSafeProps({ page_location: 'https://x.test/circles/sober-run?ref=1' })).toEqual({
      page_location: 'https://x.test/circles/[slug]',
    })
  })
})

describe('pixelSafePath', () => {
  it('leaves non-sensitive paths and index pages alone', () => {
    expect(pixelSafePath('/events/abc')).toBe('/events/abc')
    expect(pixelSafePath('/circles')).toBe('/circles')
    expect(pixelSafePath('/discover/topics/breathwork')).toBe('/discover/topics/[slug]')
  })
})
