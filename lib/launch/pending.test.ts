import { describe, expect, it } from 'vitest'
import { parsePendingLaunch, PENDING_LAUNCH_MAX_AGE, serializePendingLaunch } from './pending'

const now = new Date('2026-10-28T12:00:00Z')
const good = serializePendingLaunch({ niche: 'coaches', intents: ['events', 'circle'], answers: { spotlight: { headline: 'Breathwork in Encinitas' } } }, now)

describe('the launch hold', () => {
  it('round-trips what was written', () => {
    expect(parsePendingLaunch(good, now)).toEqual({
      niche: 'coaches',
      intents: ['events', 'circle'],
      answers: { spotlight: { headline: 'Breathwork in Encinitas' } },
      savedAt: now.toISOString(),
    })
  })

  it('reads nothing from a missing, broken or wrong-shaped cookie', () => {
    for (const raw of [undefined, '', 'nope', '[]', '"x"', '{}', '{"savedAt":"soon"}']) expect(parsePendingLaunch(raw, now)).toBeNull()
  })

  it('ignores a cookie older than 30 days and one dated in the future', () => {
    const later = new Date(now.getTime() + PENDING_LAUNCH_MAX_AGE * 1000 + 1000)
    expect(parsePendingLaunch(good, later)).toBeNull()
    expect(parsePendingLaunch(good, new Date(now.getTime() - 3_600_000))).toBeNull()
  })

  it('drops tampered parts and keeps the rest', () => {
    const raw = JSON.stringify({
      savedAt: now.toISOString(),
      niche: 'bad niche!',
      intents: ['ok', 7, 'x'.repeat(41), { a: 1 }],
      answers: { spotlight: { headline: 'Hi', 'bad key': 'x', n: 5 }, nope: { a: 'b' }, offer: 'string' },
    })
    expect(parsePendingLaunch(raw, now)).toEqual({ niche: null, intents: ['ok'], answers: { spotlight: { headline: 'Hi' } }, savedAt: now.toISOString() })
  })

  it('caps the size of what it keeps', () => {
    const fields = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${i}`, 'y'.repeat(900)]))
    const out = parsePendingLaunch(JSON.stringify({ savedAt: now.toISOString(), answers: { offer: fields } }), now)
    const kept = out?.answers.offer ?? {}
    expect(Object.keys(kept)).toHaveLength(12)
    expect(Object.values(kept).every((v) => v.length === 500)).toBe(true)
  })
})
