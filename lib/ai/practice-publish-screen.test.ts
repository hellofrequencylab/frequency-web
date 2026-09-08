import { describe, it, expect, beforeEach, vi } from 'vitest'

// Vera's pre-publish screen (Phase 2 item 2.5) — the DETERMINISTIC FALLBACK path.
//
// The AI path needs a live model; the contract that MUST hold without one is the fallback:
// when AI is off (or over budget), the screen still returns a useful, field-derived result
// (no spend, no throw). We force aiAvailable=false and assert the screen derives its score +
// completeness notes from the practice's own fields via computeQualityScore, with empty
// voice/safety (no AI ran). ADVISORY: it never throws and never gates.

let fakePractice: Record<string, unknown> | null = null
let fakeTags: string[] = []
let aiOn = false

vi.mock('@/lib/practices', () => ({
  getPractice: vi.fn(async () => fakePractice),
  getPracticeTagLabels: vi.fn(async () => fakeTags),
}))

vi.mock('./usage', () => ({
  aiAvailable: vi.fn(async () => aiOn),
  featureOverBudget: vi.fn(async () => false),
  recordAiUsage: vi.fn(async () => {}),
}))

// completeText must never be reached on the fallback path; if it is, fail loudly.
vi.mock('./complete', () => ({
  completeText: vi.fn(async () => {
    throw new Error('completeText must not be called when AI is off')
  }),
  AiUnavailableError: class AiUnavailableError extends Error {},
}))

import { screenPracticeForPublish, parseScreenJson } from './practice-publish-screen'

beforeEach(() => {
  fakePractice = null
  fakeTags = []
  aiOn = false
})

function practice(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    title: 'Box breathing',
    summary: 'Four in, four held, four out.',
    body: '- Sit\n- Breathe in',
    header_image: 'https://img/x.jpg',
    domain_id: 'd-mind',
    subcategory_id: 'sc-focus',
    duration_min: 5,
    ...over,
  }
}

describe('screenPracticeForPublish — deterministic fallback (AI off)', () => {
  it('returns a field-derived result with no AI notes when AI is off', async () => {
    fakePractice = practice()
    const res = await screenPracticeForPublish('p1')
    // No AI ran → voice + safety are empty; completeness comes from the field check.
    expect(res.voice).toEqual([])
    expect(res.safety).toEqual([])
    // A complete practice clears the advisory bar.
    expect(res.ok).toBe(true)
    expect(res.score).toBeGreaterThanOrEqual(60)
  })

  it('flags missing content fields deterministically and fails the advisory bar', async () => {
    fakePractice = practice({ summary: null, body: null, header_image: null, domain_id: null, duration_min: null })
    const res = await screenPracticeForPublish('p1')
    expect(res.completeness).toEqual(
      expect.arrayContaining(['No summary', 'No body', 'No image', 'No Pillar', 'No length']),
    )
    // Usage/freshness gaps are NOT surfaced pre-publish (a pending practice has no usage yet).
    expect(res.completeness).not.toContain('Never logged')
    expect(res.completeness).not.toContain('No freshness date')
    expect(res.ok).toBe(false)
  })

  it('returns a not-found result (never throws) for a missing practice', async () => {
    fakePractice = null
    const res = await screenPracticeForPublish('nope')
    expect(res.ok).toBe(false)
    expect(res.score).toBe(0)
    expect(res.completeness).toContain('Practice not found.')
  })
})

describe('parseScreenJson (the reply boundary, ADR-1287)', () => {
  it('reads the three note lists, dropping non-strings and capping at four', () => {
    const r = parseScreenJson('Notes:\n{"voice":["em dash"," hype ",3,""],"completeness":[],"safety":["a","b","c","d","e"]}')
    expect(r).toEqual({ voice: ['em dash', 'hype'], completeness: [], safety: ['a', 'b', 'c', 'd'] })
  })

  it('reads a missing axis as nothing to flag', () => {
    expect(parseScreenJson('{"voice":["x"]}')).toEqual({ voice: ['x'], completeness: [], safety: [] })
  })

  it('degrades to empty lists on a wrong-typed axis, truncated JSON, or no JSON (never throws)', () => {
    const empty = { voice: [], completeness: [], safety: [] }
    expect(parseScreenJson('{"voice":"not a list"}')).toEqual(empty)
    expect(parseScreenJson('{"voice":["x"')).toEqual(empty)
    expect(parseScreenJson('looks fine to me')).toEqual(empty)
    expect(parseScreenJson('')).toEqual(empty)
  })
})
