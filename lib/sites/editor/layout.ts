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
