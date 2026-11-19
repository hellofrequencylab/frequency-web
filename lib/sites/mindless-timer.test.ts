import { describe, expect, it } from 'vitest'
import { SESSION_MAX_SECONDS, breathCue, clockOf, parseLength, progressOf } from './mindless-timer'

describe('the Mindless site timer sums', () => {
  it('reads a length the way an owner types it', () => {
    expect(parseLength('1:00')).toBe(60)
    expect(parseLength('5:30')).toBe(330)
    expect(parseLength('1:05:00')).toBe(3900)
    expect(parseLength('5')).toBe(300)
    expect(parseLength('10 min')).toBe(600)
    expect(parseLength('0.5')).toBe(30)
  })
  it('refuses what is not a length and caps a long one', () => {
    expect(parseLength('')).toBeNull()
    expect(parseLength('soon')).toBeNull()
    expect(parseLength('0:05')).toBeNull()
    expect(parseLength('999')).toBe(SESSION_MAX_SECONDS)
  })
  it('draws the clock in whole seconds', () => {
    expect(clockOf(0)).toBe('0:00')
    expect(clockOf(59.9)).toBe('0:59')
    expect(clockOf(300)).toBe('5:00')
    expect(clockOf(3900)).toBe('1:05:00')
    expect(clockOf(-4)).toBe('0:00')
  })
  it('paces the breath in and out, or stays quiet', () => {
    expect(breathCue(0, 5)).toBe('Breathe in')
    expect(breathCue(5, 5)).toBe('Breathe out')
    expect(breathCue(10.2, 5)).toBe('Breathe in')
    expect(breathCue(3, 0)).toBeNull()
  })
  it('fills the bar from empty to full and no further', () => {
    expect(progressOf(0, 60)).toBe(0)
    expect(progressOf(30, 60)).toBe(50)
    expect(progressOf(90, 60)).toBe(100)
  })
})
