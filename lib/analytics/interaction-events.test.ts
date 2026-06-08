import { describe, expect, it } from 'vitest'
import {
  isValidKind,
  normalizeObservation,
  normalizeBatch,
  MAX_BATCH,
} from './interaction-events'

describe('isValidKind — open but safe taxonomy', () => {
  it('accepts safe slugs', () => {
    expect(isValidKind('view')).toBe(true)
    expect(isValidKind('scroll')).toBe(true)
    expect(isValidKind('zero_result')).toBe(true)
    expect(isValidKind('custom.thing_2')).toBe(true)
  })
  it('rejects junk', () => {
    expect(isValidKind('')).toBe(false)
    expect(isValidKind('Has Spaces')).toBe(false)
    expect(isValidKind('1leading')).toBe(false)
    expect(isValidKind('a'.repeat(60))).toBe(false)
    expect(isValidKind(42)).toBe(false)
    expect(isValidKind(null)).toBe(false)
  })
})

describe('normalizeObservation', () => {
  it('cleans a valid observation and sanitizes props', () => {
    const o = normalizeObservation({
      kind: 'dwell',
      surface: '/circles/[slug]',
      path: '/circles/sunrise',
      props: { ms: 4200, nested: { drop: 1 }, ok: 'yes' },
      t: Date.now(),
    })
    expect(o).not.toBeNull()
    expect(o!.kind).toBe('dwell')
    expect(o!.surface).toBe('/circles/[slug]')
    expect(o!.props.ms).toBe(4200)
    expect(o!.props.ok).toBe('yes')
    expect('nested' in o!.props).toBe(false) // non-primitive dropped
    expect(typeof o!.occurredAt).toBe('string')
  })

  it('drops an observation with an invalid kind', () => {
    expect(normalizeObservation({ kind: 'BAD KIND' })).toBeNull()
    expect(normalizeObservation({})).toBeNull()
  })

  it('clamps a future timestamp to now and a stale one to the window floor', () => {
    const future = normalizeObservation({ kind: 'view', t: Date.now() + 1_000_000 })!
    expect(new Date(future.occurredAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000)
    const stale = normalizeObservation({ kind: 'view', t: Date.now() - 24 * 60 * 60 * 1000 })!
    expect(new Date(stale.occurredAt).getTime()).toBeGreaterThan(Date.now() - 7 * 60 * 60 * 1000)
  })
})

describe('normalizeBatch', () => {
  it('drops invalids, keeps valids, and caps at MAX_BATCH', () => {
    const raw = [
      { kind: 'view' },
      { kind: 'BAD KIND' },
      'not an object',
      { kind: 'click', props: { target: 'btn' } },
    ]
    const out = normalizeBatch(raw)
    expect(out.map((o) => o.kind)).toEqual(['view', 'click'])

    const big = Array.from({ length: MAX_BATCH + 25 }, () => ({ kind: 'view' }))
    expect(normalizeBatch(big).length).toBe(MAX_BATCH)
  })

  it('returns [] for non-arrays', () => {
    expect(normalizeBatch(null)).toEqual([])
    expect(normalizeBatch({ kind: 'view' })).toEqual([])
  })
})
