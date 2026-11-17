import { describe, expect, it } from 'vitest'
import { hashAnswer, judgeAnswer, MAX_ANSWER_ATTEMPTS } from './mystery'

const stored = hashAnswer('The Old Mill')
const judge = (attempt: string, attemptsUsed = 0, hash: string | null = stored) => judgeAnswer({ stored: hash, attempt, attemptsUsed })

describe('hashAnswer', () => {
  it('stores a salted digest, never the answer', () => {
    expect(stored).toMatch(/^s1:[0-9a-f]{32}:[0-9a-f]{64}$/)
    expect(stored.toLowerCase()).not.toContain('mill')
  })
  it('salts each mission, so the same answer does not hash the same twice', () => {
    expect(hashAnswer('The Old Mill')).not.toBe(stored)
    const salt = Buffer.alloc(16, 7)
    expect(hashAnswer('The Old Mill', salt)).toBe(hashAnswer('the old mill', salt))
  })
})

describe('judgeAnswer', () => {
  it('accepts the answer whatever its case, spacing or Unicode form', () => {
    for (const attempt of ['The Old Mill', '  the   OLD mill ', 'ＴＨＥ ＯＬＤ ＭＩＬＬ', 'the\told\nmill']) {
      expect(judge(attempt)).toEqual({ outcome: 'correct' })
    }
  })
  it('refuses a near miss, a prefix and an empty guess', () => {
    for (const attempt of ['the old mil', 'the old mills', 'old mill', '']) expect(judge(attempt).outcome).toBe('wrong')
  })
  it('counts down, shows the fallback hint from the second wrong guess and locks on the last', () => {
    expect(judge('no', 0)).toEqual({ outcome: 'wrong', attemptsLeft: 4, showHint: false })
    expect(judge('no', 1)).toEqual({ outcome: 'wrong', attemptsLeft: 3, showHint: true })
    expect(judge('no', 3)).toEqual({ outcome: 'wrong', attemptsLeft: 1, showHint: true })
    expect(judge('no', MAX_ANSWER_ATTEMPTS - 1)).toEqual({ outcome: 'locked', attemptsLeft: 0, showHint: true })
  })
  it('still accepts the right answer on the last attempt', () => {
    expect(judge('the old mill', MAX_ANSWER_ATTEMPTS - 1)).toEqual({ outcome: 'correct' })
  })
  it('judges nothing once the attempts are used, even the right answer', () => {
    for (const used of [MAX_ANSWER_ATTEMPTS, MAX_ANSWER_ATTEMPTS + 3]) {
      expect(judge('the old mill', used)).toEqual({ outcome: 'locked', attemptsLeft: 0, showHint: true })
    }
  })
  it('fails shut on an attempt count it cannot read', () => {
    for (const used of [-1, 1.5, Number.NaN]) expect(judge('the old mill', used).outcome).toBe('locked')
  })
  it('never matches a missing or unreadable stored value, and never throws on one', () => {
    for (const hash of [null, '', 'the old mill', 's1:zz:zz', 's2:' + stored.slice(3), stored.slice(0, -2), `${stored}:extra`]) {
      expect(judge('the old mill', 0, hash).outcome).toBe('wrong')
      expect(judge('', 0, hash).outcome).toBe('wrong')
    }
  })
  it('cuts an overlong guess instead of hashing all of it', () => {
    const long = hashAnswer('a'.repeat(120))
    expect(judgeAnswer({ stored: long, attempt: 'a'.repeat(5000), attemptsUsed: 0 }).outcome).toBe('correct')
  })
})
