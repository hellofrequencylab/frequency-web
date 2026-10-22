import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// --fq-focus-ring is a COLOUR. `box-shadow: var(--fq-focus-ring)` is not a valid shadow, so it
// computes to none and the focus indicator vanishes (site audit 2026-10-22, finding 1). Use an
// outline, or give the shadow offsets and a spread: `0 0 0 2px var(--fq-focus-ring)`.
const DIR = path.join(process.cwd(), 'app', 'themes', 'frequency')

describe('Frequency focus ring', () => {
  it('is never used as a bare box-shadow colour', () => {
    const bad: string[] = []
    for (const f of readdirSync(DIR).filter((n) => n.endsWith('.css'))) {
      const css = readFileSync(path.join(DIR, f), 'utf8')
      if (/box-shadow\s*:\s*var\(--fq-focus-ring\)/.test(css)) bad.push(f)
    }
    expect(bad).toEqual([])
  })
})
