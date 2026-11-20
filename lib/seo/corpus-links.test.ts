import { describe, expect, it } from 'vitest'
import { publicCorpusLinks } from './corpus-links'

describe('publicCorpusLinks (SCAN-1276)', () => {
  it('keeps a public link as it is', () => {
    expect(publicCorpusLinks('See [pricing](/pricing).')).toBe('See [pricing](/pricing).')
  })

  it('keeps the words of a member-only link and drops the link', () => {
    for (const p of ['/founder', '/journal', '/rewards', '/upgrade', '/on-air']) {
      expect(publicCorpusLinks(`Open [the page](${p}) now.`)).toBe('Open the page now.')
    }
  })

  it('points /circles at its public listing', () => {
    expect(publicCorpusLinks('[Circles](/circles)')).toBe('[Circles](/discover/circles)')
  })

  it('leaves external links and protocol-relative links alone', () => {
    const body = '[a](https://example.com/x) [b](//cdn.example.com/y)'
    expect(publicCorpusLinks(body)).toBe(body)
  })

  it('matches a whole segment, not a prefix of a word', () => {
    expect(publicCorpusLinks('[a](/peoples-choice)')).toBe('[a](/peoples-choice)')
    expect(publicCorpusLinks('[a](/people/dana)')).toBe('a')
    expect(publicCorpusLinks('[a](/events/some-event)')).toBe('[a](/events/some-event)')
  })
})
