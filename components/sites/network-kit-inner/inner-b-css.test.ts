import { describe, expect, it } from 'vitest'
import { NETWORK_KIT_INNER_B_CSS } from './inner-b-css'

describe('the Network Kit inner-page sheet, pass B', () => {
  it('scopes every rule to the kit site render, so no member or console surface can wear it', () => {
    const rules = NETWORK_KIT_INNER_B_CSS.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('@media') && l !== '}')
    for (const r of rules) expect(r.startsWith('[data-house-theme="network-kit"]'), r).toBe(true)
  })

  it('carries no raw colour, and no private colour token', () => {
    expect(NETWORK_KIT_INNER_B_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(NETWORK_KIT_INNER_B_CSS).not.toMatch(/\b(?:rgb|hsl)a?\(/)
    expect(NETWORK_KIT_INNER_B_CSS).not.toMatch(/--nk-(?:accent|ink|paper|sand|gray)/)
  })
})
