import type { Device, SectionDisplay } from './state'
import type { Data } from '@/lib/page-editor/types'

export const EDITABLE_GRIDS = '.mw-story,.mw-hero-inner,.mw-head,.mw-grid,.mw-photos,.mw-lists,.mw-closing,.hs-split,.hs-hero-grid,.hs-steps,.hs-facts,.hs-stats-grid,.hs-cards,.hs-band-grid,.grid'

export function sectionDeviceLayout(doc: Data, id: string, device: Device): SectionDisplay {
  const entry = doc.root.props?.websiteLayout?.[id] ?? {}
  return { ...entry.desktop, ...(device === 'desktop' ? {} : entry[device]), ...(device === 'phone' ? { placements: entry.phone?.placements ?? {}, ...(typeof entry.desktop?.columns === 'number' ? { columns: entry.phone?.columns ?? 1 } : {}) } : {}) }
}
export function safeDataAttributes(value: string | undefined): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const token of (value ?? '').split(/\s+/)) {
    const match = /^(data-[a-z0-9-]+)=(.{0,200})$/.exec(token)
    if (match) attributes[match[1]] = match[2]
  }
  return attributes
}

// The handoff names the theme spacing scale without prescribing numeric steps.
export const SECTION_SPACING_STEPS = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160] as const
export function snapSectionSpacing(value: number): number {
  return SECTION_SPACING_STEPS.reduce<number>((nearest, step) => Math.abs(step - value) < Math.abs(nearest - value) ? step : nearest, 0)
}
export function sectionLayoutPreset(props: Record<string, unknown>, display: SectionDisplay, preset: 'left' | 'right' | 'stacked') {
  return { props: { ...props, mediaSide: preset === 'right' ? 'right' : 'left' }, display: { ...display, columns: preset === 'stacked' ? 1 : 2, placements: {} } }
}

export type ElementPlacement = NonNullable<SectionDisplay['placements']>[string]
export function dragElementPlacement(initial: ElementPlacement, deltaX: number, deltaY: number, columnStep: number, rowStep: number, resize: boolean, initialHeight: number): ElementPlacement {
  const dx = Number.isFinite(deltaX) ? Math.round(deltaX / Math.max(1, columnStep)) : 0
  const dy = Number.isFinite(deltaY) ? deltaY : 0
  if (resize) return { ...initial, span: Math.min(13 - initial.column, Math.max(1, initial.span + dx)), ...(Math.abs(dy) >= 4 || initial.height !== undefined ? { height: Math.min(1600, Math.max(40, Math.round(initialHeight + dy))) } : {}) }
  return { ...initial, column: Math.min(13 - initial.span, Math.max(1, initial.column + dx)), row: Math.min(100, Math.max(1, initial.row + Math.round(dy / Math.max(1, rowStep)))) }
}

/** A drop keeps sibling dimensions; occupied tracks flow into the next available row. */
export function placeElementWithoutOverlap(placements: Record<string, ElementPlacement>, key: string, next: ElementPlacement): Record<string, ElementPlacement> {
  const result = { ...placements, [key]: { ...next } }
  const parent = key.slice(0, key.lastIndexOf('.'))
  const siblings = Object.keys(result).filter((id) => id !== key && id.slice(0, id.lastIndexOf('.')) === parent)
  const overlaps = (a: ElementPlacement, b: ElementPlacement) => a.row === b.row && a.column < b.column + b.span && b.column < a.column + a.span
  for (const id of siblings) {
    if (!overlaps(result[id], result[key])) continue
    const original = result[id]
    let row = original.row + 1
    while (row <= 100 && Object.entries(result).some(([other, placement]) => other !== id && (other === key || siblings.includes(other)) && overlaps({ ...original, row }, placement))) row++
    if (row > 100) return { ...placements }
    result[id] = { ...original, row }
  }
  return result
}

/** DOM placement paths belong to a rendered theme; other authored settings survive. */
export function resetDocumentPlacements(doc: Data): Data {
  const layout = doc.root.props?.websiteLayout
  if (!layout) return doc
  let changed = false
  const next = Object.fromEntries(Object.entries(layout as Record<string, Partial<Record<Device, SectionDisplay>>>).map(([id, entry]) => [id, !entry || typeof entry !== 'object' ? entry : Object.fromEntries(Object.entries(entry).map(([device, display]) => {
    if (!display || !display.placements || Object.keys(display.placements).length === 0) return [device, display]
    changed = true
    const { placements: _placements, ...retained } = display
    void _placements
    return [device, retained]
  }))]))
  return changed ? { ...doc, root: { ...doc.root, props: { ...doc.root.props, websiteLayout: next } } } : doc
}
