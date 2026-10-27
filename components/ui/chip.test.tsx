import { describe, it, expect } from 'vitest'
import { chipClasses } from './chip'

// A chip is a choice, not an action (SCAN-1133): it rests on the kit's quiet `.chip`, a selected
// one adds `.on`, and neither ever carries the action fill.

describe('chipClasses rest', () => {
  it('is the kit chip and nothing else at rest', () => {
    expect(chipClasses(false)).toBe('chip')
  })
})

describe('chipClasses pressed', () => {
  it('adds the kit .on fill when selected, never the action fill', () => {
    const cls = chipClasses(true)
    expect(cls.split(' ')).toEqual(['chip', 'on'])
    expect(cls).not.toMatch(/bg-primary/)
  })
})

describe('chipClasses hover and focus', () => {
  it('leaves hover and focus-visible to the kit .chip rules and keeps caller layout classes', () => {
    expect(chipClasses(false, 'shrink-0')).toBe('chip shrink-0')
    expect(chipClasses(true, 'w-full')).toBe('chip on w-full')
  })
})
