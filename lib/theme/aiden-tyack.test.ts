import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { AIDEN_TYACK_ACCENTS, AIDEN_TYACK_SURFACE, aidenTyackAccentId, aidenTyackAccentVars, aidenTyackScheme } from '@/lib/theme/aiden-tyack'
import { AIDEN_TYACK_CSS } from '@/components/sites/aiden-tyack-css'
import { isPrivateTheme, mayWearTheme } from '@/lib/theme/site-style'
import { aidenTyackKit } from '@/lib/sites/kits/aiden-tyack-variants'
import { KIT_INDEX, PROFILE_KIT_INDEX, loadKit } from '@/lib/sites/kits/registry'

// THE AIDEN TYACK THEME (private, aidentyack.com): the handoff's measured families, the skin's scope and stitch, and the kit's voice.

describe('Aiden Tyack theme', () => {
  it('is private and worn only by aidentyack', () => {
    expect(isPrivateTheme('aiden-tyack')).toBe(true)
    expect(mayWearTheme('aiden-tyack', 'aidentyack', 'frequency')).toBe(true)
    expect(mayWearTheme('aiden-tyack', 'someone-else', 'new-world')).toBe(false)
  })

  it('keeps every family readable: the label on the fill and the accent text on its ground pass AA in both registers', () => {
    for (const [id, f] of Object.entries(AIDEN_TYACK_ACCENTS)) {
      expect(contrastRatio(f.day.on, f.day.accent), `${id} day button`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(f.night.on, f.night.accent), `${id} night button`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(f.day.text, AIDEN_TYACK_SURFACE.canvas), `${id} day text`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(f.night.text, '#262E1F'), `${id} night text`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('names the family an accent is, Walnut when none is set, custom for any other colour', () => {
    expect(aidenTyackScheme(null)).toBe('walnut')
    expect(aidenTyackScheme('#7A2A1A')).toBe('oxblood')
    expect(aidenTyackAccentId('#c2a57c')).toBe('walnut')
    expect(aidenTyackScheme('#123456')).toBe('custom')
    expect(aidenTyackAccentVars(null)['--color-primary']).toBe('#582F0E')
    expect(aidenTyackAccentVars('#FFE000')['--color-text-on-primary']).toBe(AIDEN_TYACK_SURFACE.text)
  })

  it('scopes the whole skin to its own root, draws the stitch, and never uses the banned violet', () => {
    for (const rule of AIDEN_TYACK_CSS.split('}').map((r) => r.trim()).filter((r) => r.includes('{') && !r.startsWith('@') && !r.startsWith('/*'))) {
      const sel = rule.slice(0, rule.indexOf('{')).replace(/\/\*[\s\S]*?\*\//g, '').trim()
      if (!sel || sel.startsWith('@')) continue
      for (const part of sel.split(',')) expect(part.trim(), sel).toMatch(/^\[data-house-theme="(aiden-tyack|services)"\]|^@|^\d|^from|^to/)
    }
    expect(AIDEN_TYACK_CSS).not.toContain('[data-house-theme="services"]')
    expect(AIDEN_TYACK_CSS).toContain('outline:var(--at-frame) var(--at-stitch);outline-offset:-7px')
    expect(AIDEN_TYACK_CSS.toUpperCase()).not.toContain('#5B3FD0')
    expect(AIDEN_TYACK_CSS).not.toMatch(/text-transform:uppercase[^}]*font-family:var\(--at-font-display\)/)
  })

  it('ships one kit that no public index lists, in the house voice', async () => {
    expect([...KIT_INDEX, ...PROFILE_KIT_INDEX].some((k) => k.id.startsWith('aiden-tyack'))).toBe(false)
    const kit = await loadKit('aiden-tyack-general')
    expect(kit?.theme).toBe('AidenTyack')
    const words = JSON.stringify(aidenTyackKit())
    expect(words).not.toMatch(/—|!|full room|Midnight/)
  })
})
