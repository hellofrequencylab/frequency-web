import { describe, it, expect } from 'vitest'
import { choiceTileClasses } from './choice-tile'

// A choice tile is a selectable box (SCAN-1133): selected is the brand outline and a soft wash,
// idle is a quiet bordered surface, and neither is the action fill.

describe('choiceTileClasses rest', () => {
  it('paints a quiet bordered surface with a hover step at rest', () => {
    const cls = choiceTileClasses(false)
    expect(cls).toContain('border-border')
    expect(cls).toContain('hover:bg-surface-elevated')
    expect(cls).not.toContain('border-primary')
  })
})

describe('choiceTileClasses pressed', () => {
  it('swaps to the brand outline and soft wash when selected, never the action fill', () => {
    const cls = choiceTileClasses(true)
    expect(cls).toContain('border-primary')
    expect(cls).toContain('bg-primary-bg/40')
    expect(cls).not.toMatch(/\bbg-primary\b(?!-)/)
    expect(cls).not.toContain('border-border')
  })
})

describe('choiceTileClasses disabled and focus', () => {
  it('dims when disabled and keeps caller layout classes', () => {
    expect(choiceTileClasses(false)).toContain('disabled:opacity-60')
    expect(choiceTileClasses(true, 'w-full p-4')).toContain('w-full p-4')
  })
})
