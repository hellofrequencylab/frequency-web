import { describe, it, expect } from 'vitest'
import { computeQualityScore, isStale, type QualityInput } from './quality'

// The quality score (Phase 2 item 2.3) is pure, so its boundaries are unit-tested without a
// database: completeness counts the seven fields, engagement saturates, freshness decays from
// updated_at, and the issue list names every gap. The score drives sorting + "needs attention",
// never a gate — these tests lock the math the UI will rank on.

const NOW = Date.parse('2026-06-29T00:00:00Z')

// A fully-complete, well-used, fresh practice: the high-water mark.
function perfect(over: Partial<QualityInput> = {}): QualityInput {
  return {
    title: 'Box breathing',
    summary: 'Four counts in, four held, four out.',
    body: '- Sit down\n- Breathe in for four',
    header_image: 'https://img/x.jpg',
    domain_id: 'd-mind',
    subcategory_id: 'sc-focus',
    duration_min: 5,
    adopters: 30,
    logs_30d: 40,
    logs_total: 200,
    updated_at: '2026-06-20T00:00:00Z', // 9 days old → full freshness
    now: NOW,
    ...over,
  }
}

describe('computeQualityScore — completeness', () => {
  it('a fully complete practice scores 100 completeness with no content issues', () => {
    const q = computeQualityScore(perfect())
    expect(q.completeness).toBe(100)
    expect(q.issues).not.toContain('No summary')
    expect(q.issues).not.toContain('No body')
  })

  it('an empty practice scores 0 completeness and flags every field', () => {
    const q = computeQualityScore(
      perfect({
        title: null, summary: null, body: null, header_image: null,
        domain_id: null, subcategory_id: null, duration_min: null,
      }),
    )
    expect(q.completeness).toBe(0)
    for (const gap of ['No title', 'No summary', 'No body', 'No image', 'No Pillar', 'No sub-category', 'No length']) {
      expect(q.issues).toContain(gap)
    }
  })

  it('counts present fields as a fraction of seven (3 of 7 ≈ 43)', () => {
    const q = computeQualityScore(
      perfect({ summary: null, header_image: null, subcategory_id: null, duration_min: null }),
    )
    // present: title, body, domain_id → 3/7
    expect(q.completeness).toBe(Math.round((3 / 7) * 100))
  })

  it('treats whitespace-only and zero-length as absent', () => {
    const q = computeQualityScore(perfect({ summary: '   ', duration_min: 0 }))
    expect(q.issues).toContain('No summary')
    expect(q.issues).toContain('No length')
  })
})

describe('computeQualityScore — engagement', () => {
  it('zero usage scores 0 engagement and flags never-logged', () => {
    const q = computeQualityScore(perfect({ adopters: 0, logs_30d: 0, logs_total: 0 }))
    expect(q.engagement).toBe(0)
    expect(q.issues).toContain('Never logged')
  })

  it('saturates: very high usage maxes at 100, not unbounded', () => {
    const q = computeQualityScore(perfect({ adopters: 9999, logs_30d: 9999, logs_total: 9999 }))
    expect(q.engagement).toBe(100)
  })

  it('flags no-recent-logs when all-time logs exist but the 30-day window is empty', () => {
    const q = computeQualityScore(perfect({ logs_30d: 0, logs_total: 50 }))
    expect(q.issues).toContain('No logs in 30 days')
    expect(q.issues).not.toContain('Never logged')
  })
})

describe('computeQualityScore — freshness', () => {
  it('full freshness inside 30 days', () => {
    expect(computeQualityScore(perfect({ updated_at: '2026-06-15T00:00:00Z' })).freshness).toBe(100)
  })

  it('zero freshness past the 180-day floor, and flags it', () => {
    const q = computeQualityScore(perfect({ updated_at: '2025-01-01T00:00:00Z' }))
    expect(q.freshness).toBe(0)
    expect(q.issues).toContain('Not touched in 6 months')
  })

  it('decays linearly between 30 and 180 days', () => {
    // ~105 days = midpoint of the 30..180 decay span → roughly half freshness.
    const updated = new Date(NOW - 105 * 86_400_000).toISOString()
    const f = computeQualityScore(perfect({ updated_at: updated })).freshness
    expect(f).toBeGreaterThan(40)
    expect(f).toBeLessThan(60)
  })

  it('a null updated_at reads as zero freshness with a flag', () => {
    const q = computeQualityScore(perfect({ updated_at: null }))
    expect(q.freshness).toBe(0)
    expect(q.issues).toContain('No freshness date')
  })
})

describe('computeQualityScore — blended total', () => {
  it('the perfect practice scores near 100', () => {
    expect(computeQualityScore(perfect()).score).toBeGreaterThanOrEqual(95)
  })

  it('the empty, unused, stale practice scores 0', () => {
    const q = computeQualityScore(
      perfect({
        title: null, summary: null, body: null, header_image: null, domain_id: null,
        subcategory_id: null, duration_min: null, adopters: 0, logs_30d: 0, logs_total: 0,
        updated_at: '2024-01-01T00:00:00Z',
      }),
    )
    expect(q.score).toBe(0)
  })

  it('weights completeness most heavily (a complete-but-unused practice still scores ~50)', () => {
    const q = computeQualityScore(perfect({ adopters: 0, logs_30d: 0, logs_total: 0 }))
    // completeness 100 * 0.5 + engagement 0 + freshness 100 * 0.2 = 70.
    expect(q.score).toBe(70)
  })
})

describe('isStale', () => {
  it('old and idle is stale', () => {
    expect(isStale({ updated_at: '2025-01-01T00:00:00Z', logs_30d: 0, now: NOW })).toBe(true)
  })
  it('old but still logged this month is NOT stale', () => {
    expect(isStale({ updated_at: '2025-01-01T00:00:00Z', logs_30d: 4, now: NOW })).toBe(false)
  })
  it('recently touched is NOT stale even with no logs', () => {
    expect(isStale({ updated_at: '2026-06-20T00:00:00Z', logs_30d: 0, now: NOW })).toBe(false)
  })
})
