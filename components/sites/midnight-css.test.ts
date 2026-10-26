import { describe, expect, it } from 'vitest'
import { MIDNIGHT_CSS } from './midnight-css'
import { MIDNIGHT_TOKENS_CSS } from '@/lib/theme/midnight'

// The Midnight skin dresses the house sections for a website wearing the theme and nothing else.
const skin = MIDNIGHT_CSS.slice(MIDNIGHT_TOKENS_CSS.length)

describe('the Midnight website skin', () => {
  it('scopes every rule under the Midnight root, so no other website changes', () => {
    const selectors = skin
      .replace(/\{[^}]*\}/g, '\n')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('@') && !s.startsWith('/*') && s !== '}' && !/^\d+%|^from$|^to$/.test(s))
    const unscoped = selectors.flatMap((line) => line.split(/,(?![^(]*\))/).map((s) => s.trim())).filter((s) => s && !s.includes('[data-house-theme="midnight"]') && !/^\d/.test(s))
    expect(unscoped).toEqual([])
  })

  it('hardcodes no colour: every value is a token', () => {
    expect(skin).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(skin).not.toMatch(/rgba?\(/)
  })

  it('hardcodes no motion the design system names', () => {
    expect(skin).not.toMatch(/cubic-bezier/)
    expect(skin).not.toMatch(/\d+ms\b/)
  })

  it('wears the bone button, the faces and the square frame through tokens', () => {
    expect(skin).toContain('background:var(--mn-solid)')
    expect(skin).toContain('font-family:var(--mn-display)')
    expect(skin).toContain('font-family:var(--mn-label)')
    expect(skin).toContain('border-radius:var(--mn-r-card)')
  })

  it('stops its motion under reduced motion', () => {
    expect(skin).toContain('@media (prefers-reduced-motion:reduce)')
  })
})
