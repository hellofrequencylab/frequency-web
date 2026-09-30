import { describe, it, expect } from 'vitest'
import { keepPrimary, resolveSplitWrite, type SplitWriteInput } from './split'
import { PRIMARY_PCT_DEFAULT, PRIMARY_PCT_FLOOR, splitZaps } from './attribution'

// The Pillar split as an edit stores it (LIVE-641, ADR-1604). Every rule in split.ts's header has
// a case here, and the last block proves the stored pair is one the attribution ledger splits
// without inflating the wallet.

const MIND = '11111111-1111-4111-8111-111111111111'
const BODY = '22222222-2222-4222-8222-222222222222'
const SPIRIT = '33333333-3333-4333-8333-333333333333'
const F = { instructions: '', timing: '' }

const input = (over: Partial<SplitWriteInput> = {}): SplitWriteInput => ({
  primary: MIND,
  focus: { [MIND]: { instructions: 'Sit', timing: '' }, [BODY]: F },
  secondary: BODY,
  primaryPct: 75,
  authored: true,
  ...over,
})

describe('resolveSplitWrite: the secondary is never the primary', () => {
  it('stores a chosen secondary with its share', () => {
    expect(resolveSplitWrite(input({ primaryPct: 60 }))).toEqual({
      secondary_domain_id: BODY,
      primary_pct: 60,
      focus_details: null,
    })
  })

  it('stores no secondary when it is the primary', () => {
    expect(resolveSplitWrite(input({ secondary: MIND })).secondary_domain_id).toBeNull()
  })

  it('clears the secondary when the primary moves onto it', () => {
    // The author made Body the primary while Body was the secondary.
    const out = resolveSplitWrite(input({ primary: BODY, secondary: BODY, authored: false }))
    expect(out).toEqual({ secondary_domain_id: null, primary_pct: PRIMARY_PCT_DEFAULT, focus_details: null })
  })

  it('stores no secondary on a practice with no primary', () => {
    expect(resolveSplitWrite(input({ primary: null })).secondary_domain_id).toBeNull()
  })

  it('stores no secondary for an empty, blank, or non-id value', () => {
    for (const secondary of [null, undefined, '', '   ', 'body', '__proto__']) {
      expect(resolveSplitWrite(input({ secondary })).secondary_domain_id).toBeNull()
    }
  })
})

describe('resolveSplitWrite: the share', () => {
  it('rests at the column default with no secondary, since the column is NOT NULL', () => {
    expect(resolveSplitWrite(input({ secondary: null, primaryPct: 60 })).primary_pct).toBe(PRIMARY_PCT_DEFAULT)
  })

  it('defaults to 75/25 when the share is missing or unreadable', () => {
    expect(resolveSplitWrite(input({ primaryPct: null })).primary_pct).toBe(75)
    expect(resolveSplitWrite(input({ primaryPct: undefined })).primary_pct).toBe(75)
    expect(resolveSplitWrite(input({ primaryPct: Number.NaN })).primary_pct).toBe(75)
  })

  it('never lets the secondary outweigh the primary: the floor is 50', () => {
    expect(resolveSplitWrite(input({ primaryPct: 10 })).primary_pct).toBe(PRIMARY_PCT_FLOOR)
    expect(resolveSplitWrite(input({ primaryPct: 50 })).primary_pct).toBe(50)
  })

  it('caps the share at 100 and rounds it to a whole percent', () => {
    expect(resolveSplitWrite(input({ primaryPct: 140 })).primary_pct).toBe(100)
    expect(resolveSplitWrite(input({ primaryPct: 66.6 })).primary_pct).toBe(67)
  })
})

describe('resolveSplitWrite: the secondary is one of the practice Focuses', () => {
  it('adds a chosen secondary to the Focus set, keeping the primary first', () => {
    const out = resolveSplitWrite(input({ secondary: SPIRIT }))
    expect(out.secondary_domain_id).toBe(SPIRIT)
    expect(Object.keys(out.focus_details ?? {})).toEqual([MIND, BODY, SPIRIT])
    // The primary's own instructions survive the add.
    expect(out.focus_details?.[MIND]).toEqual({ instructions: 'Sit', timing: '' })
    expect(out.focus_details?.[SPIRIT]).toEqual(F)
  })

  it('seeds the primary as a Focus on a legacy row whose Focus set is empty', () => {
    const out = resolveSplitWrite(input({ focus: {}, secondary: BODY }))
    expect(Object.keys(out.focus_details ?? {})).toEqual([MIND, BODY])
  })

  it('drops any Focus key that is not a Pillar id, so __proto__ or constructor never reaches the stored map', () => {
    const focus = JSON.parse(
      `{"__proto__": {"instructions": "x", "timing": ""}, "constructor": ${JSON.stringify(F)}, "junk": ${JSON.stringify(F)}, "${MIND}": ${JSON.stringify(F)}}`,
    ) as SplitWriteInput['focus']
    const out = resolveSplitWrite(input({ focus, secondary: BODY }))
    expect(Object.keys(out.focus_details ?? {})).toEqual([MIND, BODY])
    expect(Object.prototype.hasOwnProperty.call(out.focus_details, '__proto__')).toBe(false)
    expect(Object.getPrototypeOf(out.focus_details)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).instructions).toBeUndefined()
  })

  it('stores no split when the primary is not a Pillar id', () => {
    for (const primary of ['__proto__', 'constructor', 'mind']) {
      expect(resolveSplitWrite(input({ primary, secondary: BODY }))).toEqual({
        secondary_domain_id: null,
        primary_pct: PRIMARY_PCT_DEFAULT,
        focus_details: null,
      })
    }
  })

  it('leaves the Focus set alone when the secondary is already in it', () => {
    expect(resolveSplitWrite(input()).focus_details).toBeNull()
  })

  it('drops the split when the author removes the Focus that carried it', () => {
    const out = resolveSplitWrite(input({ focus: { [MIND]: F }, secondary: BODY, authored: false }))
    expect(out).toEqual({ secondary_domain_id: null, primary_pct: PRIMARY_PCT_DEFAULT, focus_details: null })
  })

  it('keeps a carried secondary that is still a Focus when only the share changes', () => {
    const out = resolveSplitWrite(input({ authored: false, primaryPct: 55 }))
    expect(out).toEqual({ secondary_domain_id: BODY, primary_pct: 55, focus_details: null })
  })
})

describe('what it stores, the ledger splits without inflating the wallet', () => {
  it('conserves every Zap across the stored pair', () => {
    for (const primaryPct of [50, 60, 75, 99, 100]) {
      const out = resolveSplitWrite(input({ primaryPct }))
      const split = { pillarId: MIND, secondaryPillarId: out.secondary_domain_id, primaryPct: out.primary_pct }
      for (const total of [8, 12, 15]) {
        const { primary, secondary } = splitZaps(total, split)
        expect(primary + secondary).toBe(total)
        expect(primary).toBeGreaterThanOrEqual(secondary)
      }
    }
  })
})

// The primary is domain_id, never the first Focus (LIVE-650, ADR-1618). focus_details is jsonb, so a
// map read back from the row lists its keys in id order: every case is tried in every key order.
describe('keepPrimary: key order never chooses the primary', () => {
  const orders = <T,>(keys: T[]): T[][] =>
    keys.length <= 1 ? [keys] : keys.flatMap((k, i) => orders([...keys.slice(0, i), ...keys.slice(i + 1)]).map((r) => [k, ...r]))
  const mapOf = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, F]))

  it('keeps the declared primary while it is one of the Focuses, in every key order', () => {
    for (const keys of orders([MIND, BODY, SPIRIT])) expect(keepPrimary(BODY, mapOf(keys))).toBe(BODY)
  })

  it('falls back to the first Focus of the map as handed only when the primary left the set', () => {
    expect(keepPrimary(BODY, mapOf([SPIRIT, MIND]))).toBe(SPIRIT)
    expect(keepPrimary(null, mapOf([MIND, SPIRIT]))).toBe(MIND)
    expect(keepPrimary(undefined, mapOf([SPIRIT]))).toBe(SPIRIT)
  })

  it('an empty map, or one with no Pillar ids, has no primary', () => {
    expect(keepPrimary(MIND, {})).toBeNull()
    expect(keepPrimary(null, { junk: F })).toBeNull()
  })

  it('a declared primary that is not a Pillar id is never kept', () => {
    expect(keepPrimary('__proto__', mapOf([MIND]))).toBe(MIND)
  })
})
