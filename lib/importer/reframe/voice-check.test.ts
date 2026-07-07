import { describe, it, expect } from 'vitest'
import { sanitizeGenerated, checkVoice, voiceReason } from './voice-check'

// The reframe voice guard: the deterministic §10 checklist floor. No network, no AI.

describe('sanitizeGenerated — em dash removal (CONTENT-VOICE §10 hard rule)', () => {
  it('replaces a spaced em dash with a comma', () => {
    expect(sanitizeGenerated('Calm mornings — steady evenings')).toBe('Calm mornings, steady evenings')
  })

  it('removes an unspaced em dash without fusing words', () => {
    // "yoga—breathwork" -> "yoga breathwork" (a word gap, never "yogabreathwork")
    expect(sanitizeGenerated('yoga—breathwork')).toBe('yoga breathwork')
  })

  it('strips the horizontal bar variant too', () => {
    expect(sanitizeGenerated('one ― two')).toBe('one, two')
  })

  it('collapses whitespace and trims', () => {
    expect(sanitizeGenerated('  a   b  \n\n\n c ')).toBe('a b\n\nc')
  })

  it('leaves clean copy untouched', () => {
    expect(sanitizeGenerated('A quiet studio for real people.')).toBe('A quiet studio for real people.')
  })
})

describe('checkVoice — the §10 machine checklist', () => {
  it('passes plain, honest copy', () => {
    const v = checkVoice('A small studio in the neighborhood. Come as you are.')
    expect(v.ok).toBe(true)
    expect(v.issues).toHaveLength(0)
  })

  it('flags an em dash', () => {
    const v = checkVoice('Calm mornings — steady evenings')
    expect(v.ok).toBe(false)
    expect(v.issues.some((i) => i.kind === 'em-dash')).toBe(true)
  })

  it('flags vibe-verbs (§5)', () => {
    const v = checkVoice('Tap into your best self and lean into the practice.')
    expect(v.ok).toBe(false)
    expect(v.issues.filter((i) => i.kind === 'vibe-verb').length).toBeGreaterThanOrEqual(1)
  })

  it('flags surface wellness jargon (§5)', () => {
    const v = checkVoice('An embodied, somatic experience.')
    expect(v.issues.filter((i) => i.kind === 'surface-jargon').length).toBe(2)
  })

  it('flags hype words (§5)', () => {
    const v = checkVoice('Unlock your potential and elevate your life.')
    expect(v.issues.filter((i) => i.kind === 'hype').length).toBeGreaterThanOrEqual(2)
  })

  it('flags a health claim (§10 item 10)', () => {
    const v = checkVoice('Our sessions cure anxiety.')
    expect(v.issues.some((i) => i.kind === 'health-claim')).toBe(true)
  })

  it('flags multiple exclamation points but allows one', () => {
    expect(checkVoice('Come say hello!').ok).toBe(true)
    expect(checkVoice('Wow! Amazing! Best!').issues.some((i) => i.kind === 'shouting')).toBe(true)
  })

  it('does not flag whole-word matches inside unrelated words', () => {
    // "align" is a vibe-verb only as "align with"; "alignment" alone is fine.
    expect(checkVoice('We focus on alignment of your goals.').ok).toBe(true)
  })

  it('allows known acronyms in caps', () => {
    expect(checkVoice('Read the FAQ for details.').ok).toBe(true)
  })

  it('voiceReason names the tripped kinds', () => {
    const v = checkVoice('Unlock your embodied journey!')
    expect(voiceReason(v)).toContain('hype')
  })
})
