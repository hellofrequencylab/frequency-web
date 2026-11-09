import { describe, expect, it } from 'vitest'
import { CYBERWITCH_CSS } from '@/components/sites/cyberwitch-css'

describe('CyberWitch site skin', () => {
  it('only ever dresses the stand-alone render: every rule sits under the house-theme attribute', () => {
    expect(CYBERWITCH_CSS).not.toContain(':root')
    expect(CYBERWITCH_CSS).not.toContain('[data-house-theme="services"]')
  })
  it('answers every --cw-* name its block sheet reads', () => {
    const declared = new Set([...CYBERWITCH_CSS.matchAll(/(?:^|[;{\n])\s*(--cw-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
    const read = new Set([...CYBERWITCH_CSS.matchAll(/var\((--cw-[a-z0-9-]+)/g)].map((m) => m[1]))
    const inline = new Set(['--cw-min', '--cw-ratio', '--cw-sv-min', '--cw-sv-ratio'])
    const missing = [...read].filter((n) => !declared.has(n) && !inline.has(n))
    expect(missing).toEqual([])
  })
  it('sizes the bare header logo and keeps hero words light over the photo', () => {
    expect(CYBERWITCH_CSS).toMatch(/\.hs-logo\{[^}]*height:clamp\(28px,6vw,36px\)/)
    expect(CYBERWITCH_CSS).toMatch(/\.hs-hero\{--color-ink:var\(--cw-ink-950\);--color-on-ink:var\(--cw-chrome-50\)/)
  })
  it('sets headlines in blackletter with the lit phrase in marker, and stops motion for reduced-motion', () => {
    expect(CYBERWITCH_CSS).toMatch(/\.hs-h1 em[^{]*\{font-family:var\(--cw-font-scrawl\)/)
    expect(CYBERWITCH_CSS).toContain('prefers-reduced-motion:reduce')
  })
})
