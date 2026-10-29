import { describe, it, expect } from 'vitest'
import { CONTRACT_SKIN_FAMILIES, contractSkinCss } from './contract-skin-css'
import { SKIN_FAMILIES, foreignBlocksFor, skinFamiliesIn, skinFamilyOf } from '@/lib/sites/skin-family'

// ── LIVE-1853: A THEME-NAMED BLOCK ON ANOTHER THEME RENDERS STYLED, IN THAT THEME'S PALETTE ──────────
// docs/THEME-COHESION.md. A family's own rules, re-scoped to the wrapper the renderer marks, with its private
// colors and faces read from the host's contract.

const families = Object.values(CONTRACT_SKIN_FAMILIES)
const own = (id: string) => `[data-house-theme="${id}"]`
const sheet = (id: (typeof SKIN_FAMILIES)[number]) => contractSkinCss([id])

describe('which family a block belongs to', () => {
  it('reads the longest prefix, so a kit is not its parent theme', () => {
    expect(skinFamilyOf('NetworkKitHero')).toBe('network-kit')
    expect(skinFamilyOf('TempleKitHero')).toBe('temple-kit')
    expect(skinFamilyOf('TempleHero')).toBe('temple')
    expect(skinFamilyOf('MidnightPageHero')).toBe('midnight')
    expect(skinFamilyOf('DesignerHero')).toBe('designer')
    expect(skinFamilyOf('WildheartSkyMap')).toBe('wildheart')
  })
  it('leaves shared blocks and the Network island alone', () => {
    expect(skinFamilyOf('Heading')).toBeNull()
    expect(skinFamilyOf('Hero')).toBeNull()
    expect(skinFamilyOf('NetworkHero')).toBeNull()
  })
  it('finds every family on a page, nested slots included', () => {
    const doc = { content: [{ type: 'Heading' }, { type: 'Columns', props: { left: [{ type: 'DesignerHero' }], right: [{ type: 'TempleKitLive' }] } }] }
    expect([...skinFamiliesIn(doc)].sort()).toEqual(['designer', 'temple-kit'])
    expect(skinFamiliesIn(null).size).toBe(0)
  })
})

describe.each(families)('the contract skin for $id', (family) => {
  const css = sheet(family.id)

  it('is non-empty and its braces balance', () => {
    expect(css.length).toBeGreaterThan(2000)
    expect((css.match(/\{/g) ?? []).length).toBe((css.match(/\}/g) ?? []).length)
  })

  it('applies only inside the wrapper and never on the family’s own site', () => {
    const scope = `[data-skin-family="${family.id}"]:not(${own(family.id)} *)`
    expect(css).toContain(scope)
    // No selector still starts at the family's theme root: every one went through the island.
    const bare = css.replaceAll(scope, '').split(own(family.id)).length - 1
    expect(bare).toBe(0)
  })

  it('drops the family’s own page colors and faces so the host’s flow through', () => {
    expect(css).not.toMatch(/(?:^|[;{\s])--color-[a-z0-9-]+\s*:/)
    expect(css.slice(0, css.lastIndexOf(`${family.id}"]:not(`))).not.toMatch(/(?:^|[;{\s])--font-(?:display|body|heading|label|mono|sans)\s*:/)
    expect(css).not.toMatch(/color-scheme\s*:/)
  })

  it('reads its palette from the host: no private color the sheets use is left at the family’s literal', () => {
    const rest = css.slice(0, css.lastIndexOf(`${family.id}"]:not(`))
    const declared = new Map<string, string>()
    for (const m of rest.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)/g)) declared.set(m[1], m[2].trim())
    const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))
    const literal = /^(?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i
    const missed = [...used].filter((name) => declared.has(name) && literal.test(declared.get(name)!) && !(name in family.overrides) && !family.keep?.includes(name))
    expect(missed).toEqual([])
  })

  it('maps every override to a host role, a host face or a mix of one', () => {
    for (const [name, value] of Object.entries(family.overrides)) {
      // Only host roles, host faces, mixes of a role, and gradients or shadows built from them: never a literal color.
      expect(value, name).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i)
      expect(value, name).toMatch(/var\(--(?:sk-[a-z-]+|font-(?:display|body))\)/)
    }
  })
})

describe('the sheet for a page', () => {
  it('sends only the families asked for, and nothing for none', () => {
    expect(contractSkinCss([])).toBe('')
    const css = contractSkinCss(['designer', 'temple'])
    expect(css).toContain('[data-skin-family="designer"]')
    expect(css).toContain('[data-skin-family="temple"]')
    expect(css).not.toContain('[data-skin-family="midnight"]')
  })
})

describe('what a theme switch changes', () => {
  const doc = { content: [{ type: 'Heading' }, { type: 'DesignerHero' }, { type: 'DesignerBand' }, { type: 'TempleHero' }, { type: 'NetworkHero' }] }
  it('counts the blocks drawn for another theme, by family', () => {
    expect(foreignBlocksFor(doc, 'bold')).toEqual([{ family: 'designer', count: 2 }, { family: 'temple', count: 1 }])
  })
  it('does not count a family on its own theme, or shared blocks', () => {
    expect(foreignBlocksFor(doc, 'designer')).toEqual([{ family: 'temple', count: 1 }])
    expect(foreignBlocksFor({ content: [{ type: 'Heading' }] }, 'bold')).toEqual([])
    expect(foreignBlocksFor(null, 'bold')).toEqual([])
  })
})
