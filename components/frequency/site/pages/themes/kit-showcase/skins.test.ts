import { describe, expect, it } from 'vitest'
import { lum, onA } from './skins'

const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a) + 0.05, lum(b) + 0.05]
  return Math.max(x, y) / Math.min(x, y)
}

describe('the label colour on a kit accent (SCAN-1202)', () => {
  it("gives Bold's Fall the charcoal label, not white (3.4:1 vs 5.4:1)", () => {
    expect(onA('#D4703E', '#111418', '#FFFFFF')).toBe('#111418')
  })
  it('always clears 4.5:1 on the five Bold accents', () => {
    for (const fill of ['#D4703E', '#00A6C8', '#93B57A', '#DDB24E', '#97A3D4']) {
      const label = onA(fill, '#111418', '#FFFFFF')
      expect(ratio(fill, label), fill).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('keeps white on a dark accent', () => {
    expect(onA('#1F3A8A', '#111418', '#FFFFFF')).toBe('#FFFFFF')
  })
})
