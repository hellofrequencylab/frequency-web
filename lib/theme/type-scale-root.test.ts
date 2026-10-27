import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')
describe('Frequency root typography after historical preset retirement', () => {
  it('retains semantic role scaling with the baseline multiplier', () => {
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
    const roles = [...root.matchAll(/--(text-[a-z0-9-]+):[^;]*var\(--type-scale/g)].map((m) => m[1])
    expect(roles.length).toBeGreaterThanOrEqual(15)
    expect(roles).toEqual(expect.arrayContaining(['text-page-title', 'text-body', 'text-meta']))
    expect(root).toMatch(/--type-scale:\s*1\s*;/)
  })
  it('does not retain hidden historical scale overrides', () => {
    expect(css).not.toMatch(/\[data-generation[^\]]*\]/)
  })
})
