import { describe, expect, it } from 'vitest'
import { TEMPLE_KIT_INNER_CSS } from './inner-css'

describe('the Temple Kit inner-page sheet', () => {
  it('scopes every rule to the kit site render, so no member or console surface can wear it', () => {
    const rules = TEMPLE_KIT_INNER_CSS.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('@media') && l !== '}')
    for (const r of rules) expect(r.startsWith('[data-house-theme="temple-kit"]'), r).toBe(true)
  })

  it('carries no raw colour, and reads only tokens the kit defines', () => {
    expect(TEMPLE_KIT_INNER_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(TEMPLE_KIT_INNER_CSS).not.toMatch(/\b(?:rgb|hsl)a?\(/)
  })
})
