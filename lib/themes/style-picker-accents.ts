import { contrastRatio, HEX_ACCENT } from '@/lib/spaces/accent'
import { midnightAccentVars } from '@/lib/theme/midnight'
import type { WebsiteTheme } from '@/lib/sites/editor/state'
import { NOCTURNE_KITS } from './nocturne-feature-data'


const SWATCHES = NOCTURNE_KITS.filter(({ hex }) => contrastRatio(hex, midnightAccentVars(hex)['--color-text-on-primary']) >= 4.5)
  .map(({ id, name, hex }) => ({ id, label: name, swatch: hex }))

export function stylePickerAccents(theme: WebsiteTheme) {
  return theme === 'Midnight' ? SWATCHES : undefined
}

export function stylePickerAccent(theme: WebsiteTheme, value: string | undefined): string | null {
  const swatches = stylePickerAccents(theme)
  if (!swatches || !value) return null
  if (HEX_ACCENT.test(value)) return value
  return swatches.find((choice) => choice.id === value)?.swatch ?? null
}
