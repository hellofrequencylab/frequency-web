import { describe, expect, it } from 'vitest'
import {
  JOURNEY_GUARANTEE_MAX_LEN,
  normalizeJourneyGuarantee,
  readJourneyGuarantee,
  writeJourneyGuarantee,
} from './guarantee'
import { readJourneyOutcomes, writeJourneyOutcomes } from './outcomes'

describe('normalizeJourneyGuarantee', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeJourneyGuarantee('  Full refund   within\n14 days.  ')).toBe('Full refund within 14 days.')
  })

  it('is empty for anything that is not a string', () => {
    for (const v of [null, undefined, 42, {}, ['a']]) expect(normalizeJourneyGuarantee(v)).toBe('')
    expect(normalizeJourneyGuarantee('   ')).toBe('')
  })

  it('caps length without leaving a trailing space', () => {
    const long = `${'x '.repeat(JOURNEY_GUARANTEE_MAX_LEN)}`
    const out = normalizeJourneyGuarantee(long)
    expect(out.length).toBeLessThanOrEqual(JOURNEY_GUARANTEE_MAX_LEN)
    expect(out).toBe(out.trim())
  })
})

describe('read / write the guarantee on page_config', () => {
  it('reads nothing from a missing, empty or non-story config', () => {
    expect(readJourneyGuarantee(null)).toBe('')
    expect(readJourneyGuarantee([{ id: 'path', enabled: true }])).toBe('')
    expect(readJourneyGuarantee([{ id: 'story', enabled: true }])).toBe('')
  })

  it('round-trips without disturbing other widgets or their order', () => {
    const stored = [
      { id: 'path', enabled: true },
      { id: 'story', enabled: true, settings: { outcomes: ['Walk out with a plan'] } },
    ]
    const next = writeJourneyGuarantee(stored, 'Full refund within 14 days.')
    expect(next.map((e) => e.id)).toEqual(['path', 'story'])
    expect(readJourneyGuarantee(next)).toBe('Full refund within 14 days.')
    // The neighbour on the same settings bag is untouched.
    expect(readJourneyOutcomes(next)).toEqual(['Walk out with a plan'])
    // Input is not mutated.
    expect(readJourneyGuarantee(stored)).toBe('')
  })

  it('appends a story entry when none exists, and only when there is something to say', () => {
    expect(writeJourneyGuarantee([], '')).toEqual([])
    const next = writeJourneyGuarantee([], 'Cancel any time before week two.')
    expect(next).toEqual([{ id: 'story', enabled: true, settings: { guarantee: 'Cancel any time before week two.' } }])
  })

  it('clearing deletes the key, and empties the settings bag the same way outcomes does', () => {
    const withBoth = writeJourneyOutcomes(writeJourneyGuarantee([], 'Refund within 14 days.'), ['Ship a practice'])
    const cleared = writeJourneyGuarantee(withBoth, '   ')
    expect(readJourneyGuarantee(cleared)).toBe('')
    // Outcomes survive their neighbour being cleared.
    expect(readJourneyOutcomes(cleared)).toEqual(['Ship a practice'])

    // And when the guarantee was the ONLY thing in settings, the bag goes away entirely rather
    // than lingering as `{}` — the shape writeJourneyOutcomes lands on.
    const only = writeJourneyGuarantee([], 'Refund within 14 days.')
    const emptied = writeJourneyGuarantee(only, '')
    expect(emptied).toEqual([{ id: 'story', enabled: true }])
  })

  it('a cleared guarantee and a never-written one are the same state', () => {
    const never = writeJourneyGuarantee([{ id: 'story', enabled: true }], '')
    const cleared = writeJourneyGuarantee(writeJourneyGuarantee([{ id: 'story', enabled: true }], 'x'), '')
    expect(cleared).toEqual(never)
  })
})
