import { describe, expect, it } from 'vitest'
import {
  JOURNEY_OUTCOME_MAX_LEN,
  JOURNEY_OUTCOMES_CAP,
  normalizeJourneyOutcomes,
  readJourneyOutcomes,
  writeJourneyOutcomes,
} from './outcomes'

describe('normalizeJourneyOutcomes', () => {
  it('keeps trimmed strings and drops empties', () => {
    expect(normalizeJourneyOutcomes(['  Hold a morning circle  ', '', '  '])).toEqual(['Hold a morning circle'])
  })

  it('reads { text } rows the rail would send', () => {
    expect(normalizeJourneyOutcomes([{ text: 'Name the feeling' }, { text: '' }, 'Lead the close'])).toEqual([
      'Name the feeling',
      'Lead the close',
    ])
  })

  it('caps count and length', () => {
    const long = 'x'.repeat(JOURNEY_OUTCOME_MAX_LEN + 20)
    expect(normalizeJourneyOutcomes([long])[0]).toHaveLength(JOURNEY_OUTCOME_MAX_LEN)
    expect(normalizeJourneyOutcomes(Array.from({ length: JOURNEY_OUTCOMES_CAP + 4 }, (_, i) => `o${i}`))).toHaveLength(
      JOURNEY_OUTCOMES_CAP,
    )
  })
})

describe('read / write journey outcomes on page_config', () => {
  it('reads nothing from a missing or empty story', () => {
    expect(readJourneyOutcomes(null)).toEqual([])
    expect(readJourneyOutcomes([{ id: 'path', enabled: true }])).toEqual([])
    expect(readJourneyOutcomes([{ id: 'story', enabled: true }])).toEqual([])
  })

  it('round-trips through the story settings without touching wizard or order', () => {
    const stored = [
      { id: 'path', enabled: true },
      { id: 'story', enabled: false, settings: { note: 'keep' } },
      { id: 'wizard', enabled: false, settings: { v: 1 } },
    ]
    const next = writeJourneyOutcomes(stored, ['Hold the room', '  '])
    expect(next.map((e) => e.id)).toEqual(['path', 'story', 'wizard'])
    expect(next[1]).toEqual({
      id: 'story',
      enabled: false,
      settings: { note: 'keep', outcomes: ['Hold the room'] },
    })
    expect(readJourneyOutcomes(next)).toEqual(['Hold the room'])
  })

  it('clears the key when the list is emptied, and appends story when it was missing', () => {
    const cleared = writeJourneyOutcomes(
      [{ id: 'story', enabled: true, settings: { outcomes: ['Old'] } }],
      [],
    )
    expect(cleared[0]).toEqual({ id: 'story', enabled: true })
    expect(readJourneyOutcomes(cleared)).toEqual([])

    const added = writeJourneyOutcomes([{ id: 'wizard', enabled: false, settings: { v: 1 } }], ['Walk out with a plan'])
    expect(added.at(-1)).toEqual({
      id: 'story',
      enabled: true,
      settings: { outcomes: ['Walk out with a plan'] },
    })
  })
})
