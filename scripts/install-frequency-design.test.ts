import { describe, expect, it } from 'vitest'
import { namespace, scopeSelector, transform } from './install-frequency-design.mjs'

// ADR-1740: the installer is the only path from a Claude Design export to the app. These pin the two
// things that would silently break the site if they drifted: the namespace (the export's --text-body is
// a colour, the app's is a font size) and the scope (nothing applies under DAWN).
describe('install-frequency-design', () => {
  it('renames every custom property into --fq-, once', () => {
    expect(namespace('--text-body:#38322D;color:var(--text-body)')).toBe('--fq-text-body:#38322D;color:var(--fq-text-body)')
    expect(namespace(namespace('--accent:x'))).toBe('--fq-accent:x')
  })

  it('maps the export surfaces onto the switch', () => {
    expect(scopeSelector(':root')).toBe(':root[data-design="frequency"]')
    expect(scopeSelector('[data-theme="commons"]')).toBe(':root[data-design="frequency"]')
    expect(scopeSelector('[data-theme="commons"][data-time="night"]')).toBe('.dark[data-design="frequency"]')
    expect(scopeSelector('[data-theme="stage"]')).toContain('[data-design="frequency"] [data-surface="stage"]')
    expect(scopeSelector('[data-time="night"][data-night="uv"]')).toBeNull()
    expect(scopeSelector('h1')).toBe('[data-design="frequency"] h1')
    expect(scopeSelector('.fq-aura')).toBe('.fq-aura')
  })

  it('drops the font @import even when its URL carries semicolons, and layers element defaults', () => {
    const css = "@import url('https://fonts.googleapis.com/css2?family=X:wght@400;500&display=swap');\n:root{--font-sans:'X'}\nh1{color:var(--text-strong)}"
    const out = transform(css, { layer: 'base' })
    expect(out).not.toMatch(/@import|wght@400/)
    expect(out).toMatch(/^@layer base \{/)
    expect(out).toContain(':root[data-design="frequency"]{--fq-font-sans:')
    expect(out).toContain('[data-design="frequency"] h1{color:var(--fq-text-strong)}')
  })
})
