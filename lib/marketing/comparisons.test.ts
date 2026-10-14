import { describe, it, expect } from 'vitest'
import {
  COMPARISONS,
  getComparison,
  comparisonSlugs,
  comparisonPath,
  comparisonCopy,
} from './comparisons'

// The comparison ("alternative to X") generator (GE11-1). The page, its metadata,
// and its JSON-LD all read from comparisonCopy(), so these tests lock the copy is
// well-formed, voice-compliant (no em dashes), and that the registry is internally
// consistent (unique slugs, real contrast rows).

describe('comparison registry', () => {
  it('has unique, url-safe slugs', () => {
    const slugs = comparisonSlugs()
    expect(slugs.length).toBe(COMPARISONS.length)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('resolves a known competitor and rejects an unknown one', () => {
    expect(getComparison('partiful')?.name).toBe('Partiful')
    expect(getComparison('nope')).toBeUndefined()
  })

  it('builds the canonical path from the slug', () => {
    expect(comparisonPath('meetup')).toBe('/vs/meetup')
  })

  // Owner ruling 2026-10-14: Linktree and Calendly are out (next.config.ts 301s each to /vs), and
  // Meetup and Facebook Groups are in.
  it('carries the ruled set: no Linktree or Calendly, and Meetup and Facebook Groups', () => {
    const slugs = comparisonSlugs()
    expect(slugs).not.toContain('linktree')
    expect(slugs).not.toContain('calendly')
    expect(slugs).toEqual(expect.arrayContaining(['meetup', 'facebook-groups']))
  })

  it('never promises a weekly cadence or hides the paid plans behind "free, always"', () => {
    const text = JSON.stringify(COMPARISONS)
    expect(text).not.toMatch(/every week|next week|weekly/i)
    expect(text).not.toContain('Free to join, always')
  })

  it('gives every competitor a non-empty contrast with both sides filled', () => {
    for (const c of COMPARISONS) {
      expect(c.contrast.length).toBeGreaterThan(0)
      for (const row of c.contrast) {
        expect(row.dimension.trim()).not.toBe('')
        expect(row.them.trim()).not.toBe('')
        expect(row.us.trim()).not.toBe('')
      }
    }
  })
})

describe('comparisonCopy', () => {
  it('builds answer-first copy that names the competitor', () => {
    const c = getComparison('meetup')!
    const copy = comparisonCopy(c)
    expect(copy.h1).toBe('Frequency vs Meetup')
    expect(copy.metaTitle).toContain('Meetup')
    expect(copy.description).toContain('Meetup')
    // The lede leads with the honest "what they are good at", answer-first.
    expect(copy.lede.startsWith(c.theyAreGoodAt)).toBe(true)
  })

  it('produces an FAQ whose questions are in the reader\'s words and answers resolve', () => {
    const copy = comparisonCopy(getComparison('eventbrite')!)
    expect(copy.faq.length).toBeGreaterThanOrEqual(3)
    for (const { q, a } of copy.faq) {
      expect(q.endsWith('?')).toBe(true)
      expect(a.trim().length).toBeGreaterThan(0)
    }
    // Honesty bar: a question literally asking the difference is answered.
    expect(copy.faq.some((f) => /difference/i.test(f.q))).toBe(true)
  })

  it('keeps every generated string free of em dashes (CONTENT-VOICE hard rule)', () => {
    for (const c of COMPARISONS) {
      const copy = comparisonCopy(c)
      const strings = [
        copy.h1,
        copy.metaTitle,
        copy.description,
        copy.ogTitle,
        copy.lede,
        ...copy.faq.flatMap((f) => [f.q, f.a]),
      ]
      for (const s of strings) {
        expect(s, `em dash in: ${s}`).not.toContain('—')
      }
    }
  })

  it('keeps the source registry copy free of em dashes too', () => {
    for (const c of COMPARISONS) {
      const strings = [
        c.name,
        c.category,
        c.theyAreGoodAt,
        c.theDifference,
        c.forReader,
        ...c.contrast.flatMap((r) => [r.dimension, r.them, r.us]),
      ]
      for (const s of strings) {
        expect(s, `em dash in: ${s}`).not.toContain('—')
      }
    }
  })
})
