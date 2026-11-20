import { describe, expect, it } from 'vitest'
import { isMemberOnlyPath, publicCorpusLinks } from './corpus-links'

const SITE = 'https://frequencylocal.com'

describe('publicCorpusLinks (SCAN-1276)', () => {
  it('makes a public link absolute', () => {
    expect(publicCorpusLinks('See [pricing](/pricing).', SITE)).toBe(`See [pricing](${SITE}/pricing).`)
  })

  it('keeps the words of a member-only link and drops the link', () => {
    for (const p of ['/founder', '/journal', '/rewards', '/upgrade', '/on-air']) {
      expect(publicCorpusLinks(`Open [the page](${p}) now.`, SITE)).toBe('Open the page now.')
    }
  })

  it('points /circles at its public listing', () => {
    expect(publicCorpusLinks('[Circles](/circles)', SITE)).toBe(`[Circles](${SITE}/discover/circles)`)
  })

  it('leaves external links and protocol-relative links alone', () => {
    const body = '[a](https://example.com/x) [b](//cdn.example.com/y)'
    expect(publicCorpusLinks(body, SITE)).toBe(body)
  })

  it('matches a whole segment, not a prefix of a word', () => {
    expect(isMemberOnlyPath('/peoples-choice')).toBe(false)
    expect(isMemberOnlyPath('/people/dana')).toBe(true)
    expect(isMemberOnlyPath('/events/some-event')).toBe(false)
  })
})
