import { describe, expect, it } from 'vitest'
import {
  JOURNEY_FAQ_ANSWER_MAX_LEN,
  JOURNEY_FAQ_CAP,
  JOURNEY_FAQ_QUESTION_MAX_LEN,
  normalizeJourneyFaq,
  readJourneyFaq,
  writeJourneyFaq,
} from './faq'
import { readJourneyGuarantee, writeJourneyGuarantee } from './guarantee'
import { readJourneyOutcomes, writeJourneyOutcomes } from './outcomes'

describe('normalizeJourneyFaq', () => {
  it('keeps rows with both halves, trimmed and whitespace-collapsed, in order', () => {
    expect(
      normalizeJourneyFaq([
        { q: '  Is this for beginners?  ', a: 'Yes.\n\nWe start   from zero.' },
        { q: 'What if I miss a week?', a: 'Phases stay open.' },
      ]),
    ).toEqual([
      { q: 'Is this for beginners?', a: 'Yes. We start from zero.' },
      { q: 'What if I miss a week?', a: 'Phases stay open.' },
    ])
  })

  it('drops a question with no answer, an answer with no question, and anything not a record', () => {
    expect(
      normalizeJourneyFaq([
        { q: 'Unanswered?', a: '   ' },
        { q: '', a: 'Orphan answer' },
        'a string',
        42,
        null,
        ['q', 'a'],
        { q: 'Kept?', a: 'Kept.' },
      ]),
    ).toEqual([{ q: 'Kept?', a: 'Kept.' }])
  })

  it('is empty for anything that is not a list', () => {
    for (const v of [null, undefined, 'x', 42, {}, { q: 'a', a: 'b' }]) expect(normalizeJourneyFaq(v)).toEqual([])
  })

  it('caps count and both lengths without leaving a trailing space', () => {
    const many = Array.from({ length: JOURNEY_FAQ_CAP + 3 }, (_, i) => ({ q: `q${i}?`, a: `a${i}` }))
    expect(normalizeJourneyFaq(many)).toHaveLength(JOURNEY_FAQ_CAP)

    const [row] = normalizeJourneyFaq([
      { q: 'x '.repeat(JOURNEY_FAQ_QUESTION_MAX_LEN), a: 'y '.repeat(JOURNEY_FAQ_ANSWER_MAX_LEN) },
    ])
    expect(row.q.length).toBeLessThanOrEqual(JOURNEY_FAQ_QUESTION_MAX_LEN)
    expect(row.a.length).toBeLessThanOrEqual(JOURNEY_FAQ_ANSWER_MAX_LEN)
    expect(row.q).toBe(row.q.trim())
    expect(row.a).toBe(row.a.trim())
  })
})

describe('read / write the questions on page_config', () => {
  it('reads nothing from a missing, empty or non-story config', () => {
    expect(readJourneyFaq(null)).toEqual([])
    expect(readJourneyFaq(undefined)).toEqual([])
    expect(readJourneyFaq([{ id: 'path', enabled: true }])).toEqual([])
    expect(readJourneyFaq([{ id: 'story', enabled: true }])).toEqual([])
    expect(readJourneyFaq([{ id: 'story', enabled: true, settings: { faq: 'not a list' } }])).toEqual([])
  })

  it('round-trips without disturbing other widgets, their order, or the neighbours on the bag', () => {
    const stored = [
      { id: 'path', enabled: true },
      { id: 'story', enabled: false, settings: { outcomes: ['Walk out with a plan'], guarantee: 'Refund within 14 days.' } },
      { id: 'wizard', enabled: false, settings: { v: 1 } },
    ]
    const next = writeJourneyFaq(stored, [{ q: 'Is this live?', a: 'Yes, Sundays.' }, { q: 'Draft?', a: '' }])
    expect(next.map((e) => e.id)).toEqual(['path', 'story', 'wizard'])
    expect(readJourneyFaq(next)).toEqual([{ q: 'Is this live?', a: 'Yes, Sundays.' }])
    expect(next[1]).toMatchObject({ id: 'story', enabled: false })
    expect(next[2]).toEqual({ id: 'wizard', enabled: false, settings: { v: 1 } })
    // The neighbours on the same settings bag are untouched.
    expect(readJourneyOutcomes(next)).toEqual(['Walk out with a plan'])
    expect(readJourneyGuarantee(next)).toBe('Refund within 14 days.')
    // Input is not mutated.
    expect(readJourneyFaq(stored)).toEqual([])
  })

  it('appends a story entry when none exists, and only when there is something to say', () => {
    expect(writeJourneyFaq([], [])).toEqual([])
    expect(writeJourneyFaq([], [{ q: 'Half?', a: '' }])).toEqual([])
    const next = writeJourneyFaq([{ id: 'wizard', enabled: false, settings: { v: 1 } }], [{ q: 'Solo?', a: 'Sure.' }])
    expect(next).toEqual([
      { id: 'wizard', enabled: false, settings: { v: 1 } },
      { id: 'story', enabled: true, settings: { faq: [{ q: 'Solo?', a: 'Sure.' }] } },
    ])
  })

  it('clearing deletes the key, and empties the settings bag the same way its neighbours do', () => {
    const withAll = writeJourneyGuarantee(
      writeJourneyOutcomes(writeJourneyFaq([], [{ q: 'Q?', a: 'A.' }]), ['Ship a practice']),
      'Refund within 14 days.',
    )
    const cleared = writeJourneyFaq(withAll, [])
    expect(readJourneyFaq(cleared)).toEqual([])
    expect(readJourneyOutcomes(cleared)).toEqual(['Ship a practice'])
    expect(readJourneyGuarantee(cleared)).toBe('Refund within 14 days.')

    // When the questions were the ONLY thing in settings, the bag goes away entirely rather than
    // lingering as `{}`, the shape writeJourneyOutcomes and writeJourneyGuarantee both land on.
    const only = writeJourneyFaq([], [{ q: 'Q?', a: 'A.' }])
    expect(writeJourneyFaq(only, [])).toEqual([{ id: 'story', enabled: true }])
    expect(writeJourneyFaq(only, [])).toEqual(writeJourneyOutcomes(writeJourneyOutcomes([], ['x']), []))
  })

  it('a cleared list and a never-written one are the same state', () => {
    const never = writeJourneyFaq([{ id: 'story', enabled: true }], [])
    const cleared = writeJourneyFaq(writeJourneyFaq([{ id: 'story', enabled: true }], [{ q: 'Q?', a: 'A.' }]), [])
    expect(cleared).toEqual(never)
  })
})
