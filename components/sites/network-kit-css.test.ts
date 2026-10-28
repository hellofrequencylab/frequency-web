import { describe, expect, it } from 'vitest'
import { NETWORK_KIT_CSS } from './network-kit-css'
import { NETWORK_KIT_TOKENS_CSS } from '@/lib/theme/network-kit'

// The kit skin is token-only: raw colour lives in lib/theme/network-kit.ts, never in the sheet that wears it.
const skin = NETWORK_KIT_CSS.replace(NETWORK_KIT_TOKENS_CSS, '')

describe('the Network Theme Kit skin', () => {
  it('names no raw colour outside the token block', () => {
    expect(skin).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(skin).not.toMatch(/rgba?\(|hsla?\(|oklch\(|(?<![-\w])(black|white)(?![-\w])/)
  })
  it('scopes every rule under the kit theme attribute', () => {
    const rules = skin.split(/\}\s*/).map((r) => r.replace(/^@media[^{]*\{/, '').trim()).filter((r) => r && !r.startsWith('/*') && !r.startsWith('@'))
    for (const r of rules) {
      const sel = r.split('{')[0]!.replace(/\/\*[\s\S]*?\*\//g, '').trim()
      if (sel) expect(sel, sel).toContain('data-house-theme="network-kit"')
    }
  })
  it('holds the design rules: the grain, 2px ink focus, 44/48/56 targets, sentence-case labels, a moveless reduced motion', () => {
    expect(skin).toContain('mix-blend-mode:multiply')
    expect(skin).toContain(':focus-visible{outline:2px solid var(--color-focus-ring);outline-offset:3px}')
    expect(skin).toContain('--nk-control-h-sm')
    expect(skin).toContain('--nk-control-h-lg')
    expect(skin).toContain('translateY(-1px)')
    expect(skin).toContain('--nk-radius-leaf')
    expect(skin).not.toMatch(/text-transform:uppercase/)
    expect(skin).toContain('prefers-reduced-motion:reduce')
    expect(skin).toContain('data-footer="minimal"')
  })
})
