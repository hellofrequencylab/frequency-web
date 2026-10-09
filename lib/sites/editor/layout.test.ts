import { describe, expect, it } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import { safeDataAttributes, sectionDeviceLayout, snapSectionSpacing, sectionLayoutPreset, dragElementPlacement, placeElementWithoutOverlap, resetDocumentPlacements } from './layout'

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

it('moves and resizes within safe grid bounds without changing the source placement', () => {
  const initial = { column: 4, span: 6, row: 2 }
  expect(dragElementPlacement(initial, 200, 150, 100, 150, false, 200)).toEqual({ column: 6, span: 6, row: 3 })
  expect(dragElementPlacement(initial, 9999, -9999, 100, 100, false, 200)).toEqual({ column: 7, span: 6, row: 1 })
  expect(dragElementPlacement(initial, 9999, 9999, 100, 100, true, 200)).toEqual({ column: 4, span: 9, row: 2, height: 1600 })
  expect(dragElementPlacement(initial, -9999, -9999, 100, 100, true, 200)).toEqual({ column: 4, span: 1, row: 2, height: 40 })
  expect(dragElementPlacement(initial, 100, 0, 100, 100, true, 200)).toEqual({ column: 4, span: 7, row: 2 })
  expect(initial).toEqual({ column: 4, span: 6, row: 2 })
})

it('keeps a no-op three-card drop identical and flows a colliding card without narrowing siblings', () => {
  const original = { '1.0': { column: 1, span: 6, row: 1 }, '1.1': { column: 7, span: 6, row: 1 }, '1.2': { column: 1, span: 6, row: 2 }, '2.0': { column: 1, span: 12, row: 1 } }
  expect(placeElementWithoutOverlap(original, '1.2', original['1.2'])).toEqual(original)
  const moved = placeElementWithoutOverlap(original, '1.2', { column: 1, span: 6, row: 1 })
  expect(moved['1.0']).toEqual({ column: 1, span: 6, row: 2 })
  expect(moved['1.1']).toEqual(original['1.1'])
  expect(moved['2.0']).toEqual(original['2.0'])
  expect(original['1.0'].row).toBe(1)
})

it('clears theme-specific DOM positions across every device while retaining content and other style settings', () => {
  const doc: Data = { root: { props: { websiteLayout: { hero: { desktop: { padding: 32, placements: { '1.0': { column: 1, span: 6, row: 1 } } }, tablet: { textSize: 40, placements: { '1.0': { column: 7, span: 6, row: 1 } } }, phone: { hidden: false, placements: { '1.0': { column: 1, span: 12, row: 1 } } } } } } }, content: [{ type: 'Text', props: { id: 'hero', body: 'Original copy' } }] }
  const result = resetDocumentPlacements(doc)
  expect(result.root.props!.websiteLayout.hero).toEqual({ desktop: { padding: 32 }, tablet: { textSize: 40 }, phone: { hidden: false } })
  expect(result.content).toBe(doc.content)
  expect(doc.root.props!.websiteLayout.hero.desktop.placements).toHaveProperty('1.0')
  expect(resetDocumentPlacements(result)).toBe(result)
})
