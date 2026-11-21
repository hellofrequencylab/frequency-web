import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isThinSpotlightText, SPOTLIGHT_MIN_WORDS, wordCount } from './thin-spotlight'

describe('isThinSpotlightText (SCAN-1277)', () => {
  it('calls empty and short About text thin', () => {
    expect(isThinSpotlightText(null)).toBe(true)
    expect(isThinSpotlightText('   ')).toBe(true)
    expect(isThinSpotlightText('Yoga teacher in Encinitas.')).toBe(true)
  })

  it('indexes a Spotlight with a real sentence or two', () => {
    const bio = 'I teach slow flow yoga in Encinitas and run a Sunday beach sit for anyone who wants to come.'
    expect(wordCount(bio)).toBeGreaterThanOrEqual(SPOTLIGHT_MIN_WORDS)
    expect(isThinSpotlightText(bio)).toBe(false)
  })


  it('the sitemap reader cuts on the same number of words', () => {
    // lib/spotlight/data.ts writes the rule inline so the sitemap reader probe can run it on its own.
    expect(readFileSync('lib/spotlight/data.ts', 'utf8')).toContain(`.filter(Boolean).length >= ${SPOTLIGHT_MIN_WORDS})`)
  })
})
