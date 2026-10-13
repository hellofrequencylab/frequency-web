import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DESIGNS } from '../design'

// FONTS PER DESIGN (ADR-1737). app/layout.tsx imports ./active, and ./active is ONE static re-export
// that scripts/write-design-assets.mjs points at the build's design. These hold the three ways that
// can go wrong: a design with no font module, a committed ./active left pointing at a non-DAWN design
// after a local Frequency build, and the layout reaching past ./active to a design module directly
// (which would put that design's faces into every deploy's graph).

const active = readFileSync('lib/theme/design-fonts/active.ts', 'utf8')
const layout = readFileSync('app/layout.tsx', 'utf8')

describe('fonts per design', () => {
  it('gives every registered design a font module that names itself', () => {
    for (const d of DESIGNS) {
      const path = `lib/theme/design-fonts/${d.id}.ts`
      expect(existsSync(path), path).toBe(true)
      expect(readFileSync(path, 'utf8')).toContain(`FONTS_DESIGN: DesignId = '${d.id}'`)
    }
  })

  it("commits ./active pointing at DAWN, as one static re-export", () => {
    const exports = active.split('\n').filter((l) => /^(import|export)\b/.test(l))
    expect(exports).toEqual(["export { DESIGN_FONT_CLASS, FONTS_DESIGN } from './dawn'"])
  })

  it('the root layout reads only ./active, never a design module directly', () => {
    expect(layout).toContain("from '@/lib/theme/design-fonts/active'")
    for (const d of DESIGNS) expect(layout).not.toContain(`design-fonts/${d.id}'`)
  })
})
