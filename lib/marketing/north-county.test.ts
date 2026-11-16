import { describe, expect, it } from 'vitest'
import { FOUNDING_CITIES } from '@/lib/site'
import { NORTH_COUNTY_TOWNS, NORTH_COUNTY_DESCRIPTION, NORTH_COUNTY_LEDE, northCountyFaq } from './north-county'
import { localAnswers } from './quick-answers'

describe('North County hub copy (SCAN-1209, SCAN-1223)', () => {
  it('has one section per founding town, with a slug the city route resolves', () => {
    expect(NORTH_COUNTY_TOWNS.map((t) => t.name)).toEqual([...FOUNDING_CITIES])
    for (const t of NORTH_COUNTY_TOWNS) {
      expect(t.slug).toMatch(/^[a-z]+(-[a-z]+)*$/)
      expect(t.blurb.length).toBeGreaterThan(20)
    }
  })

  it('answers the local questions with the place name in them', () => {
    const faq = northCountyFaq()
    expect(faq.length).toBeGreaterThanOrEqual(6)
    expect(faq.some((f) => /North County San Diego/.test(f.q))).toBe(true)
    expect(faq.some((f) => /yoga/i.test(f.q) && /Encinitas|North County/.test(f.a))).toBe(true)
    expect(faq.some((f) => /Encinitas/.test(f.q))).toBe(true)
  })

  it('shares its local answers with the llms corpora', () => {
    const shared = localAnswers({ abs: (p) => p }).map((x) => x.q)
    expect(northCountyFaq().map((f) => f.q)).toEqual(expect.arrayContaining(shared))
  })

  it('carries no em dash and no health claim', () => {
    const text = [NORTH_COUNTY_DESCRIPTION, NORTH_COUNTY_LEDE, ...NORTH_COUNTY_TOWNS.map((t) => t.blurb), ...northCountyFaq().flatMap((f) => [f.q, f.a])].join('\n')
    expect(text).not.toContain('—')
    expect(text).not.toMatch(/\b(heal|cure|therap|treat|anxiety|depress)/i)
  })
})
