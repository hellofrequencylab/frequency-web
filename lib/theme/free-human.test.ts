import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { contrastRatio } from '@/lib/spaces/accent'
import tokens from '@/docs/design-systems/free-human/tokens.json'
import { FREE_HUMAN_ACCENT, FREE_HUMAN_GILT, FREE_HUMAN_NIGHT, FREE_HUMAN_SKY, FREE_HUMAN_PALETTE as P, FREE_HUMAN_PROFILES, FREE_HUMAN_SEASONS, FREE_HUMAN_SOLID, FREE_HUMAN_SURFACE, FREE_HUMAN_TOKENS_CSS, FREE_HUMAN_VARIANTS_CSS, freeHumanAccentVars } from './free-human'
import { FREE_HUMAN_CSS } from '@/components/sites/free-human-css'

const DS = tokens as Record<string, string>
const N = '[data-house-theme="free-human"]'

describe('the Free Human Theme Kit palette', () => {
  it('holds every raw colour ramp the design system declares, value for value', () => {
    const ramp = /^--([a-z]+)-(\d+)$/
    let seen = 0
    for (const [key, value] of Object.entries(DS)) {
      const [scope, name] = key.split('|')
      const m = scope === ':root' && /^#[0-9a-f]{6}$/i.test(value) ? name.match(ramp) : null
      if (!m) continue
      const own = (P as Record<string, string>)[`${m[1]}${m[2]}`]
      expect(own?.toLowerCase(), name).toBe(value.toLowerCase())
      seen++
    }
    expect(seen).toBeGreaterThan(50)
  })

  it('reads AA on every pair the kit relies on', () => {
    expect(contrastRatio(FREE_HUMAN_SOLID.on, FREE_HUMAN_SOLID.fill)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(FREE_HUMAN_ACCENT.text, P.cream100)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(FREE_HUMAN_SURFACE.text, FREE_HUMAN_SURFACE.canvas)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(FREE_HUMAN_SURFACE.muted, FREE_HUMAN_SURFACE.canvas)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(FREE_HUMAN_NIGHT.accent, FREE_HUMAN_NIGHT.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(FREE_HUMAN_GILT.on, FREE_HUMAN_GILT.fill)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(FREE_HUMAN_SKY.text, FREE_HUMAN_SKY.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(FREE_HUMAN_SKY.accent, FREE_HUMAN_SKY.bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the four seasons the design names', () => {
    expect(FREE_HUMAN_SEASONS).toEqual({ winter: P.indigo500, spring: P.jade500, summer: P.brass600, fall: P.clay500 })
  })

  it('hands the Space accent through, or the madder, with a label that reads', () => {
    expect(freeHumanAccentVars(null)['--color-primary']).toBe(P.clay500)
    expect(freeHumanAccentVars('not a colour')['--color-primary']).toBe(P.clay500)
    const custom = freeHumanAccentVars('#1F4AA8')
    expect(custom['--color-primary']).toBe('#1F4AA8')
    expect(contrastRatio(custom['--color-text-on-primary'], '#1F4AA8')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('the Free Human Theme Kit token block', () => {
  it('is scoped to the kit root, leaves the accent to the Space and reads the kit faces', () => {
    expect(FREE_HUMAN_TOKENS_CSS).toMatch(/\[data-house-theme="free-human"\]\{--cream-50|\[data-house-theme="free-human"\]\{--fh-cream-50/)
    expect(FREE_HUMAN_TOKENS_CSS).not.toMatch(/--color-primary[a-z-]*:/)
    expect(FREE_HUMAN_TOKENS_CSS).toContain('var(--font-fh-cormorant)')
    expect(FREE_HUMAN_TOKENS_CSS).not.toContain(':root')
    // Every rule starts at the kit root: no selector can reach a member, Space console or admin area.
    for (const sel of (FREE_HUMAN_TOKENS_CSS + FREE_HUMAN_VARIANTS_CSS).matchAll(/(?:^|\})\s*([^{}@]+)\{/g)) expect(sel[1].trim().startsWith(N), sel[1]).toBe(true)
  })

  it('names the raw ramps --fh-* and keeps the design values', () => {
    expect(FREE_HUMAN_TOKENS_CSS).toContain('--fh-cream-100:#F7ECDA')
    expect(FREE_HUMAN_TOKENS_CSS).toContain('--fh-clay-500:#B3361F')
    expect(FREE_HUMAN_TOKENS_CSS).toContain('--fh-radius-arch:999px 999px 120px 120px')
  })

  it('declares one block per profile and the look axes', () => {
    expect(FREE_HUMAN_TOKENS_CSS).toContain('--kit-accent:var(--accent-general)')
    for (const id of Object.keys(FREE_HUMAN_PROFILES).filter((k) => k !== 'general')) expect(FREE_HUMAN_VARIANTS_CSS, id).toContain(`[data-kit="${id}"]`)
    for (const a of ['data-site-corners="soft"', 'data-site-corners="subtle"', 'data-site-corners="square"', 'data-site-spacing="balanced"', 'data-site-spacing="compact"', 'data-site-header="pill"']) expect(FREE_HUMAN_VARIANTS_CSS, a).toContain(a)
  })

  it('ships the design textures and the mark under public/', () => {
    expect(readdirSync('public/sites/free-human/textures').filter((f) => f.endsWith('.svg'))).toHaveLength(10)
    for (const f of ['logo-mark.svg', 'logo-mark-dark.svg']) expect(existsSync(`public/sites/free-human/${f}`), f).toBe(true)
  })

  it('the skin is the token block plus rules that all start at the kit root', () => {
    const head = FREE_HUMAN_TOKENS_CSS + FREE_HUMAN_VARIANTS_CSS
    expect(FREE_HUMAN_CSS.startsWith(head)).toBe(true)
    const skin = FREE_HUMAN_CSS.slice(head.length).replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes [\w-]+\{(?:[^{}]*\{[^{}]*\})+\}/g, '')
    for (const sel of skin.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)) for (const part of sel[1].split(',')) expect(part.trim().startsWith(N), part).toBe(true)
    expect(FREE_HUMAN_CSS).not.toMatch(/#5B3FD0/i)
  })
})

