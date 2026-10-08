import type { Device, SectionDisplay } from './state'
import type { Data } from '@/lib/page-editor/types'

export const EDITABLE_GRIDS = '.mw-story,.mw-hero-inner,.mw-head,.mw-grid,.mw-photos,.mw-lists,.mw-closing'
export type GridPlacement = { column: number; span: number; row: number }

// Stable DOM paths reference theme component children, never the editor handles.
export function gridChildKey(gridIndex: number, childIndex: number): string {
  return `${gridIndex}:${childIndex}`
}
export function sectionDeviceLayout(doc: Data, id: string, device: Device): SectionDisplay {
  const entry = doc.root.props?.websiteLayout?.[id] ?? {}
  return { ...entry.desktop, ...(device === 'desktop' ? {} : entry[device]), ...(device === 'phone' ? { placements: entry.phone?.placements ?? {} } : {}) }
}
export function safeDataAttributes(value: string | undefined): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const token of (value ?? '').split(/\s+/)) {
    const match = /^(data-[a-z0-9-]+)=(.{0,200})$/.exec(token)
    if (match) attributes[match[1]] = match[2]
  }
  return attributes
}
