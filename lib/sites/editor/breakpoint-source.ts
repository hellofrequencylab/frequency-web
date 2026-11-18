// WHERE A SECTION'S BREAKPOINT VALUE COMES FROM, IN THE WEBSITE BUILDER (PROG-E5). The website document already
// stores a section's layout as sparse per-device bags (`root.props.websiteLayout[id]`: desktop is the base, tablet
// and phone hold only what differs, updateSectionDisplay drops a value equal to desktop). That is the same shape
// the E5 inspector model reads (InspectorDeviceValues), so the provenance and the one-field reset here are the
// model's own resolveInspectorValue and resetInspectorOverride, not a second inheritance rule.
//
// One website rule sits on top: a section with a desktop column count shows one column on a phone until the phone
// sets its own (sectionDeviceLayout, lib/sites/editor/layout.ts). That value is the phone's default, not desktop's.

import { resetInspectorOverride, resolveInspectorValue, type InspectorDeviceValues } from '@/lib/builder/inspector-model'
import type { Data } from '@/lib/page-editor/types'
import type { Device, SectionDisplay } from './state'

/** The section settings a device may override, as the inspector's Design controls write them. */
export type BreakpointField = 'align' | 'padding' | 'columns' | 'gap' | 'textSize'

/** A device that inherits: tablet and phone. Desktop is the base. */
type ChildDevice = Exclude<Device, 'desktop'>

/** Where the value comes from: a device's own override, the phone's one-column default, or nothing (the theme). */
type BreakpointSource = Device | 'phone-default' | null

function entryOf(doc: Data, id: string): InspectorDeviceValues<SectionDisplay> {
  return (doc.root.props?.websiteLayout?.[id] ?? {}) as InspectorDeviceValues<SectionDisplay>
}

/** Where one section setting on one device comes from. */
export function sectionFieldSource(doc: Data, id: string, device: Device, field: BreakpointField): BreakpointSource {
  const { source } = resolveInspectorValue(entryOf(doc, id), device, field)
  if (device === 'phone' && field === 'columns' && source === 'desktop') return 'phone-default'
  return source
}

/** The source in words, for the device being edited. */
export function breakpointSourceLabel(device: Device, source: BreakpointSource): string {
  if (source === 'phone-default') return 'Phone default: one column'
  if (source === null) return 'Theme default'
  if (source === device) return device === 'desktop' ? 'Set on desktop' : `Set for ${device}`
  return 'Inherited from desktop'
}

/** The section's display on `device` with ONE override removed, ready for the inspector's onDisplay (which keeps
 *  only what differs from desktop). Every other override on that device stays as it is. */
export function resetSectionField(doc: Data, id: string, device: ChildDevice, field: BreakpointField): SectionDisplay {
  const next = resetInspectorOverride(entryOf(doc, id), device, field)
  return { ...next.desktop, ...next[device] }
}
