import { describe, it, expect } from 'vitest'
import { ANALYTICS_EVENTS, isTrackedEvent, isClientEvent } from './events'
import { sanitizeProps } from './track'

describe('analytics taxonomy', () => {
  it('has unique, namespaced event names', () => {
    const names = ANALYTICS_EVENTS.map((e) => e.name)
    expect(new Set(names).size).toBe(names.length)
    for (const n of names) expect(n).toMatch(/^[a-z]+\.[a-z_]+$/)
  })

  it('isTrackedEvent recognizes registered events only', () => {
    expect(isTrackedEvent('nav.page_view')).toBe(true)
    expect(isTrackedEvent('totally.madeup')).toBe(false)
  })

  it('isClientEvent blocks server-authoritative events from client emit', () => {
    expect(isClientEvent('nav.page_view')).toBe(true)
    expect(isClientEvent('feature.used')).toBe(true)
    expect(isClientEvent('practice.adopted')).toBe(false) // server-authoritative
    expect(isClientEvent('circle.joined')).toBe(false)
    expect(isClientEvent('unknown.event')).toBe(false)
  })
})

describe('sanitizeProps', () => {
  it('keeps primitives, drops objects/functions, truncates strings', () => {
    const out = sanitizeProps({ a: 1, b: true, c: 'x'.repeat(1000), d: { nested: 1 }, e: null })
    expect(out.a).toBe(1)
    expect(out.b).toBe(true)
    expect((out.c as string).length).toBe(500)
    expect('d' in out).toBe(false)
    expect('e' in out).toBe(false)
  })

  it('caps the number of keys', () => {
    const big = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]))
    expect(Object.keys(sanitizeProps(big)).length).toBe(20)
  })

  it('returns empty for non-objects', () => {
    expect(sanitizeProps(null)).toEqual({})
    expect(sanitizeProps('nope')).toEqual({})
  })
})
