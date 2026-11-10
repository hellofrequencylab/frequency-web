import { describe, expect, it } from 'vitest'
import { resolveWebsiteBrand, type WebsiteSnapshot } from '@/lib/sites/editor/state'
import { contrastRatio } from '@/lib/spaces/accent'
import { designerAccentVars } from '@/lib/theme/designer'
import { DESIGNER_KITS } from './designer-feature-data'
import { themeAccents, themeEditor } from './editor-dials'

describe('Designer style picker', () => {
  it('offers only shipped profile swatches with readable filled labels', () => {
    const dials = themeEditor('designer').dials.map(({ id }) => id)
    expect(dials.sort()).toEqual(['accent', 'corners', 'footer', 'header', 'spacing'])
    for (const { id, swatch } of themeAccents('Designer')) {
      expect(swatch).toBe(DESIGNER_KITS.find((kit) => kit.id === id)?.hex)
      expect(contrastRatio(swatch, designerAccentVars(swatch)['--color-text-on-primary'])).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('resolves every offered Look while keeping an existing brand color when no Look is picked', () => {
    const original = { accent: '#123456' }
    const website: WebsiteSnapshot = { theme: 'Designer', pages: [] }
    const { looks } = themeEditor('designer')
    expect(looks.map(({ id }) => id)).toEqual(['own', 'coaches', 'studios', 'hosts', 'creators'])
    expect(resolveWebsiteBrand(website, original).accent).toBe(original.accent)
    for (const { id, dials } of looks.slice(1)) {
      expect(resolveWebsiteBrand({ ...website, look: dials }, original).accent).toBe(DESIGNER_KITS.find((kit) => kit.id === id)?.hex)
    }
  })
})
