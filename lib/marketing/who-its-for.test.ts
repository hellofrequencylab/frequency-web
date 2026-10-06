import { describe, it, expect } from 'vitest'
import { WHO_FREQUENCY_IS_FOR } from './who-its-for'
import { ARCHETYPE_NAME_RE } from '../../scripts/check-canon.mjs'

describe('who Frequency is for (ADR-1715)', () => {
  const all = [...WHO_FREQUENCY_IS_FOR].join('\n')

  it('names every family in plain words', () => {
    for (const x of [/calm down fast/i, /just moved/i, /run club/i, /breathing timer/i, /bring others together/i, /Crew/, /teacher/i, /studio/i, /small groups/i]) {
      expect(all, String(x)).toMatch(x)
    }
  })

  it('never says an internal archetype name, "seekers", or an em dash', () => {
    expect(all).not.toMatch(ARCHETYPE_NAME_RE)
    expect(all).not.toMatch(/\bseekers\b/i)
    expect(all).not.toContain('—')
  })
})
