import { describe, it, expect } from 'vitest'
import { computeCompleteness } from './completeness'

const FULL = {
  displayName: 'Ada Lovelace',
  handle: 'ada',
  bio: 'I build things.',
  avatarUrl: 'https://x/a.png',
  headerImageUrl: 'https://x/h.png',
  city: 'London',
  website: 'https://ada.dev',
  spotlightEnabled: true,
}

describe('computeCompleteness (ADR-516 Phase B) — pure profile score', () => {
  it('scores a fully-filled profile at 100% with no gaps', () => {
    const r = computeCompleteness(FULL)
    expect(r.percent).toBe(100)
    expect(r.filled).toBe(r.total)
    expect(r.gaps).toHaveLength(0)
  })

  it('scores an empty profile at 0% with every item as a gap', () => {
    const r = computeCompleteness({})
    expect(r.percent).toBe(0)
    expect(r.filled).toBe(0)
    expect(r.gaps).toHaveLength(r.total)
  })

  it('treats blank / whitespace strings and a disabled Spotlight as unfilled', () => {
    const r = computeCompleteness({ displayName: '   ', bio: '', spotlightEnabled: false })
    expect(r.filled).toBe(0)
  })

  it('rounds the percentage and lists the biggest gap first (header image before others)', () => {
    // Everything filled except the header image → 7/8 = 88%; the header gap leads.
    const r = computeCompleteness({ ...FULL, headerImageUrl: '' })
    expect(r.percent).toBe(88)
    expect(r.gaps[0]?.field).toBe('headerImageUrl')
    expect(r.gaps[0]?.nudge).toContain('header image')
  })

  it('keeps every nudge on-canon (no em dashes; Spotlight is a proper noun)', () => {
    const r = computeCompleteness({})
    for (const g of r.gaps) {
      expect(g.nudge).not.toContain('—')
      expect(g.nudge).not.toMatch(/\bspotlight\b/) // must be capitalized where used
    }
  })
})
