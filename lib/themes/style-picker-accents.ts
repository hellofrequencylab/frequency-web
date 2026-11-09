import { HEX_ACCENT } from '@/lib/spaces/accent'

import type { WebsiteTheme } from '@/lib/sites/editor/state'
import { DESIGNER_KITS } from './designer-feature-data'

// These existing profile colours meet the filled-label contrast floor on the Designer site.
const PICKER_IDS = new Set(['coaches', 'studios', 'hosts', 'creators', 'faith', 'markets'])
const SWATCHES = DESIGNER_KITS.filter(({ id }) => PICKER_IDS.has(id))
  .map(({ id, name, hex }) => ({ id, label: name, swatch: hex }))

export function stylePickerAccents(theme: WebsiteTheme) {
  return theme === 'Designer' ? SWATCHES : undefined
}

export function stylePickerAccent(theme: WebsiteTheme, value: string | undefined): string | null {
  const swatches = stylePickerAccents(theme)
  if (!swatches || !value) return null
  if (HEX_ACCENT.test(value)) return value
  return swatches.find((choice) => choice.id === value)?.swatch ?? null
}
