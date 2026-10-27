import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { GENERATIONS, DEFAULT_GENERATION } from './generations'
import { OCCASIONS } from './occasions'
import { serializeThemeCookie, parseThemeCookie } from './cookie'
const state = vi.hoisted(() => ({ cookie: '' }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: state.cookie }) }) }))
import { resolveTheme } from './server/resolve'

describe('retired saved axes cannot reactivate platform overlays', () => {
  it.each(GENERATIONS.flatMap(gen => OCCASIONS.map(occ => [gen.id, occ.id] as const)))('stored %s/%s remains readable but renders balanced/none', async (gen, occ) => {
    state.cookie = serializeThemeCookie({ gen, occ, skin: 'midnight' })
    expect(parseThemeCookie(state.cookie)).toEqual({ gen, occ, skin: 'midnight' })
    expect(DEFAULT_GENERATION).toBe('balanced')
    expect(await resolveTheme({ spaceGeneration: gen, now: new Date('2026-12-21') })).toEqual({ skin: 'midnight', generation: 'balanced', occasion: 'none' })
  })
  it('preserves root reduced motion and looping animation cancellation without a generation attribute', () => {
    const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--motion-fast: 0ms;\s*--motion-base: 0ms;\s*--motion-slow: 0ms;/)
    expect(css).toMatch(/\.animate-pulse,\s*\.animate-spin\s*\{\s*animation: none !important;/)
  })
})
