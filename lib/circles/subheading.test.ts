import { describe, it, expect } from 'vitest'
import {
  CIRCLE_SUBHEADING_MAX,
  circlePlaceLine,
  circleSubheading,
  firstSentence,
} from './subheading'

describe('firstSentence', () => {
  it('keeps a single unterminated line whole', () => {
    expect(firstSentence('A quiet room for people who run')).toBe('A quiet room for people who run')
  })

  it('stops at the first terminator', () => {
    expect(firstSentence('We meet Tuesdays. Bring a chair. Rain or shine.')).toBe('We meet Tuesdays.')
    expect(firstSentence('Want in? Just turn up.')).toBe('Want in?')
  })

  it('does not split a decimal, because there is no space after the stop', () => {
    expect(firstSentence('We start at 5.30pm sharp')).toBe('We start at 5.30pm sharp')
  })

  it('collapses newlines and padding', () => {
    expect(firstSentence('  Sunrise   swims.\n\nEvery day.  ')).toBe('Sunrise swims.')
  })

  it('truncates a long sentence on a word boundary', () => {
    const long = `${'word '.repeat(60)}end.`
    const out = firstSentence(long)
    expect(out.length).toBeLessThanOrEqual(CIRCLE_SUBHEADING_MAX + 1)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toMatch(/wor…$/)
  })

  it('is empty for empty prose', () => {
    expect(firstSentence('   ')).toBe('')
  })
})

describe('circlePlaceLine', () => {
  it('names an online circle without inventing a place', () => {
    expect(circlePlaceLine({ type: 'online', city: 'Vista' })).toBe('Meets online.')
  })

  it('joins neighbourhood and city', () => {
    expect(circlePlaceLine({ type: 'in-person', neighborhood: 'Leucadia', city: 'Encinitas' })).toBe(
      'Meets in person in Leucadia, Encinitas.',
    )
  })

  it('is empty when an in-person circle has no place on file', () => {
    expect(circlePlaceLine({ type: 'in-person' })).toBe('')
  })
})

describe('circleSubheading', () => {
  it('names the Space on a Space Circle, ahead of everything else', () => {
    expect(
      circleSubheading({
        isSpaceCircle: true,
        spaceName: 'Royal Temple',
        about: 'Ignore me',
        city: 'Vista',
      }),
    ).toBe('News, events and everything else going on at Royal Temple.')
  })

  it('falls back to a space-less line rather than printing "at undefined"', () => {
    expect(circleSubheading({ isSpaceCircle: true, spaceName: null })).toBe(
      'News, events and everything else going on here.',
    )
  })

  // The production case this rule was written for: every Space Circle has a NULL `about`, so an
  // about-first order would leave a Space's own hub with a blank subheading.
  it('still speaks when a Space Circle has no about at all', () => {
    expect(circleSubheading({ isSpaceCircle: true, spaceName: 'House of Fates', about: null })).toBe(
      'News, events and everything else going on at House of Fates.',
    )
  })

  it("prefers an ordinary circle's own words", () => {
    expect(
      circleSubheading({ about: 'Cold water, warm people. Every Sunday.', city: 'Encinitas' }),
    ).toBe('Cold water, warm people.')
  })

  it('falls back to the place when there is no about', () => {
    expect(circleSubheading({ type: 'in-person', city: 'Carlsbad' })).toBe(
      'Meets in person in Carlsbad.',
    )
  })

  it('returns empty when there is nothing true to say', () => {
    expect(circleSubheading({ type: 'in-person', about: '  ' })).toBe('')
  })
})
