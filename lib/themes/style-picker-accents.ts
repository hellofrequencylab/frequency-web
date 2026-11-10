import { contrastRatio, HEX_ACCENT } from '@/lib/spaces/accent'
import { NETWORK_KIT_SCHEME_ORDER, NETWORK_KIT_SCHEMES, networkKitPickedAccent } from '@/lib/theme/network-kit'
import { templeKitAccentVars } from '@/lib/theme/temple-kit'
import type { WebsiteTheme } from '@/lib/sites/editor/state'
import { DESIGNER_KITS } from './designer-feature-data'
import { TEMPLE_KITS } from './temple-feature-data'

// These existing profile colours meet the filled-label contrast floor on the Designer site.
const DESIGNER_PICKER_IDS = new Set(['coaches', 'studios', 'hosts', 'creators', 'faith', 'markets'])
const DESIGNER_SWATCHES = DESIGNER_KITS.filter(({ id }) => DESIGNER_PICKER_IDS.has(id))
  .map(({ id, name, hex }) => ({ id, label: name, swatch: hex }))

const NETWORK_SWATCHES = NETWORK_KIT_SCHEME_ORDER.map((id) => ({ id, label: NETWORK_KIT_SCHEMES[id].label, swatch: NETWORK_KIT_SCHEMES[id].accent }))

// Only the Temple profiles whose filled label clears the contrast floor are offered.
const TEMPLE_SWATCHES = TEMPLE_KITS.filter(({ hex }) => contrastRatio(hex, templeKitAccentVars(hex)['--color-text-on-primary']) >= 4.5)
  .map(({ id, name, hex }) => ({ id, label: name, swatch: hex }))

export function stylePickerAccents(theme: WebsiteTheme) {
  if (theme === 'NetworkKit') return NETWORK_SWATCHES
  if (theme === 'Designer') return DESIGNER_SWATCHES
  return theme === 'TempleKit' ? TEMPLE_SWATCHES : undefined
}

export function stylePickerAccent(theme: WebsiteTheme, value: string | undefined): string | null {
  if (theme === 'NetworkKit') return networkKitPickedAccent(value)
  const swatches = stylePickerAccents(theme)
  if (!swatches || !value) return null
  if (HEX_ACCENT.test(value)) return value
  return swatches.find((choice) => choice.id === value)?.swatch ?? null
}
