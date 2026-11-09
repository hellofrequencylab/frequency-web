import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { NEW_WORLD_ACCENTS, NEW_WORLD_DAY_CSS, NEW_WORLD_DETAIL_CSS, NEW_WORLD_ON_ACCENT, NEW_WORLD_TOKENS_CSS, NEW_WORLD_SURFACE, type NewWorldAccentId } from './new-world'

const SHEETS = [NEW_WORLD_TOKENS_CSS, NEW_WORLD_DAY_CSS, NEW_WORLD_DETAIL_CSS]

describe('New World theme tokens', () => {
  it('scopes every selector to the stand-alone site render, never :root (theme fence)', () => {
    for (const css of SHEETS) {
      expect(css).not.toContain(':root')
      for (const sel of css.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)) expect(sel[1].trim().startsWith('[data-house-theme="new-world"]'), sel[1]).toBe(true)
    }
  })
  it('names every custom property --nw-* so no other theme meets them', () => {
    for (const css of SHEETS) for (const decl of css.matchAll(/(?:^|[;{\n])\s*(--[a-z0-9-]+)\s*:/g)) expect(decl[1].startsWith('--nw-'), decl[1]).toBe(true)
  })
  it('keeps the two registers apart: Night is the default, Day is a section override', () => {
    expect(NEW_WORLD_TOKENS_CSS).not.toContain('data-th="day"')
    expect(NEW_WORLD_DAY_CSS).toContain('data-th="day"')
    expect(NEW_WORLD_DETAIL_CSS).toContain('data-pairing="detail"')
  })
  it('offers Tide, Signal, Bloom, Ember and Fern, and no violet (Iris stays out)', () => {
    expect(Object.keys(NEW_WORLD_ACCENTS)).toEqual(['tide', 'signal', 'bloom', 'ember', 'fern'])
  })
  it('starts in Tide teal and carries white on every preset accent (Daniel 2026-11-04: white labels, ink only on a very light accent)', () => {
    expect(NEW_WORLD_ON_ACCENT).toBe('#FFFFFF')
    expect(NEW_WORLD_TOKENS_CSS).toContain('--nw-text-on-accent:#FFFFFF')
    for (const id of Object.keys(NEW_WORLD_ACCENTS) as NewWorldAccentId[]) expect(contrastRatio(NEW_WORLD_ON_ACCENT, NEW_WORLD_ACCENTS[id].accent), id).toBeGreaterThanOrEqual(2)
    expect(NEW_WORLD_SURFACE.accent.accent).toBe(NEW_WORLD_ACCENTS.tide.accent)
  })
  it('carries white on the deep Tide the Day register uses, at least 4.5:1', () => {
    expect(NEW_WORLD_DAY_CSS).toContain('--nw-text-on-accent:#FFFFFF')
    expect(contrastRatio('#FFFFFF', '#12768B')).toBeGreaterThanOrEqual(4.5)
  })
  it('self-hosts the Detail pairing: the Look reads the site fonts first and every file ships', () => {
    for (const v of ['--font-nwd-bricolage', '--font-nwd-lora', '--font-nwd-mono']) expect(NEW_WORLD_DETAIL_CSS).toContain(`var(${v},`)
    for (const f of ['bricolage-grotesque/bricolage-grotesque', 'lora/lora', 'lora/lora-italic', 'dm-mono/dm-mono-400', 'dm-mono/dm-mono-500']) expect(existsSync(join(process.cwd(), 'app/fonts', `${f}.woff2`)), f).toBe(true)
  })
})
