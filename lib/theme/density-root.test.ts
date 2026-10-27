import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')
describe('Frequency root density after historical preset retirement', () => {
  it('preserves the root density consumer and baseline fallback', () => {
    expect(css).toMatch(/html\s*\{[\s\S]*?font-size:\s*var\(--density-root, 106\.25%\)/)
    expect(css).toMatch(/--density-root:\s*106\.25%/)
  })
  it('cannot silently reactivate historical density presets', () => {
    expect(css).not.toMatch(/\[data-generation[^\]]*\]/)
  })
})
