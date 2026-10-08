import { describe, expect, it } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import { safeDataAttributes, sectionDeviceLayout } from './layout'

describe('website layout', () => {
  it('stacks phone blocks until a phone placement is explicitly saved', () => {
    const desktopPlacement = { column: 7, span: 6, row: 1 }
    const doc = { root: { props: { websiteLayout: { hero: { desktop: { textSize: 80, placements: { '1.0': desktopPlacement } }, phone: { textSize: 46 } } } } }, content: [] } as Data
    expect(sectionDeviceLayout(doc, 'hero', 'tablet').placements).toEqual({ '1.0': desktopPlacement })
    expect(sectionDeviceLayout(doc, 'hero', 'phone')).toEqual({ textSize: 46, placements: {} })
  })
  it('accepts only data attributes without executable event handlers', () => {
    expect(safeDataAttributes('data-campaign=autumn onclick=alert(1) style=display:none data-id=night')).toEqual({ 'data-campaign': 'autumn', 'data-id': 'night' })
  })
})
