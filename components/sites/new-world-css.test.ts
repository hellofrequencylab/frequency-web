import { describe, expect, it } from 'vitest'
import { NEW_WORLD_CSS } from '@/components/sites/new-world-css'

// The 2026-11-03 danieltyack break: a skinned header prints a bare `.hs-logo`, house-css sizes only `.hs-logo-avatar` and
// `.hs-logo-image`, so the owner's photo filled the bar and hid the menu and headline. And the ink bridge turned hero washes teal.
describe('New World site skin', () => {
  it('sizes the bare header logo', () => {
    expect(NEW_WORLD_CSS).toMatch(/\.hs-logo\{[^}]*height:clamp\(28px,6vw,36px\)/)
  })
  it('keeps hero words light over the photo in both registers', () => {
    expect(NEW_WORLD_CSS).toMatch(/\.hs-hero\{--color-ink:var\(--nw-ink-950\);--color-on-ink:var\(--nw-chrome-50\)/)
  })
  it('draws the closing card as a Night card, never flat accent with an accent button', () => {
    expect(NEW_WORLD_CSS).toMatch(/\.mw-closing\.mw-closing\{--color-ink:var\(--nw-surface-card\);--color-on-ink:var\(--nw-text-primary\);--color-on-ink-muted:var\(--nw-text-secondary\)/)
  })
})
