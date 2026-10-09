import { describe, expect, it } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import { safeDataAttributes, sectionDeviceLayout, snapSectionSpacing, sectionLayoutPreset } from './layout'

describe('website layout', () => {
  it('stacks phone blocks until a phone placement is explicitly saved', () => {
    const desktopPlacement = { column: 7, span: 6, row: 1 }
    const doc = { root: { props: { websiteLayout: { hero: { desktop: { textSize: 80, placements: { '1.0': desktopPlacement } }, phone: { textSize: 46 } } } } }, content: [] } as Data
    expect(sectionDeviceLayout(doc, 'hero', 'tablet').placements).toEqual({ '1.0': desktopPlacement })
    expect(sectionDeviceLayout(doc, 'hero', 'phone')).toEqual({ textSize: 46, placements: {} })
  })
  it('automatically stacks desktop column layouts on phone until explicitly overridden', () => {
    const doc = { root: { props: { websiteLayout: { section: { desktop: { columns: 4 }, phone: {} } } } }, content: [] } as Data
    expect(sectionDeviceLayout(doc, 'section', 'phone').columns).toBe(1)
    doc.root.props!.websiteLayout.section.phone.columns = 2
    expect(sectionDeviceLayout(doc, 'section', 'phone').columns).toBe(2)
  })
  it('accepts only data attributes without executable event handlers', () => {
    expect(safeDataAttributes('data-campaign=autumn onclick=alert(1) style=display:none data-id=night')).toEqual({ 'data-campaign': 'autumn', 'data-id': 'night' })
  })
})

 it('snaps edge spacing and presets preserve authored content while resetting freeform positions', () => {
   expect(snapSectionSpacing(29)).toBe(32)
   expect(snapSectionSpacing(-20)).toBe(0)
   expect(snapSectionSpacing(200)).toBe(160)
   const props = { image: '/original.jpg', lead: 'Authored copy', mediaSide: 'right' }
   const display = { padding: 32, placements: { '1.0': { column: 7, span: 6, row: 1 } } }
   expect(sectionLayoutPreset(props, display, 'stacked')).toEqual({ props: { ...props, mediaSide: 'left' }, display: { padding: 32, columns: 1, placements: {} } })
   expect(sectionLayoutPreset(props, display, 'right').props.mediaSide).toBe('right')
   expect(props.mediaSide).toBe('right')
   expect(display.placements['1.0'].column).toBe(7)
 })
