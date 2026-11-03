import { describe, expect, it } from 'vitest'
import { NEW_WORLD_BLOCKS_CSS } from '@/components/sites/new-world-blocks-css'
import { NEW_WORLD_DAY_CSS, NEW_WORLD_DETAIL_CSS, NEW_WORLD_TOKENS_CSS } from '@/lib/theme/new-world'

// The New World block sheet is derived from the Services block sheet; it must stay inside the New World scope and read only tokens
// the New World theme defines.
describe('the New World block sheet', () => {
  it('is scoped to New World and never to Services', () => {
    expect(NEW_WORLD_BLOCKS_CSS).toContain('[data-house-theme="new-world"]')
    expect(NEW_WORLD_BLOCKS_CSS).not.toContain('data-house-theme="services"')
  })

  it('reads only tokens New World defines (plus the two values a block sets on itself)', () => {
    const defined = new Set([...(NEW_WORLD_TOKENS_CSS + NEW_WORLD_DAY_CSS + NEW_WORLD_DETAIL_CSS).matchAll(/(--nw-[a-z0-9-]+):/g)].map((m) => m[1]))
    const used = [...NEW_WORLD_BLOCKS_CSS.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1])
    const unknown = [...new Set(used)].filter((v) => !v.startsWith('--color-') && !v.startsWith('--radius-') && !v.startsWith('--font-') && !defined.has(v) && v !== '--sv-min' && v !== '--sv-ratio')
    expect(unknown).toEqual([])
  })

  it('uses the depth ramp, not the shadow ramp', () => {
    expect(NEW_WORLD_BLOCKS_CSS).not.toContain('--nw-shadow-sm')
    expect(NEW_WORLD_BLOCKS_CSS).not.toContain('--nw-shadow-md')
    expect(NEW_WORLD_BLOCKS_CSS).not.toContain('--nw-shadow-lg')
  })
})
