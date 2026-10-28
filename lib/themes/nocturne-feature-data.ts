// Nocturne Theme Kit data for the /themes/nocturne feature page. Copied from the Default Template design
// system (handoff/frequency/kits.nocturne.json) into nocturne-feature-data.json, trimmed to what the page reads
// (JSON because the kit accents are colour data). The id of each kit equals the Wizard niche
// (lib/theme/mega-theme.ts), so every adopt button goes to /spaces/new?niche=<id>.
import contract from '../sites/editor/theme-contract.json'
import data from './nocturne-feature-data.json'

export interface NocturneKit {
  id: string
  name: string
  hex: string
  who: string
  packages: string[]
  blocks: string[]
  layouts: Record<string, string | undefined>
  fonts: { display: string; label: string }
  look: { corners: string; spacing: string; header: string; footer: string }
  hero: { title: string; em: string }
}
interface NocturnePackage {
  id: string
  name: string
  stage: string
  blurb: string
  locked: boolean
}
interface NocturneBlock {
  id: string
  name: string
  pkg: string
  stage: string
}

/** The Business kit wears the violet the owner allowed on 2026-10-28, set in the kit data, the one file besides the editor contract that
 *  the violet-family probe lets carry a violet. A kit with no accent falls back to the editor contract's. */
export const NOCTURNE_KITS: NocturneKit[] = data.kits.map((k) => ({ ...k, hex: k.hex ?? contract.themes.Midnight['--th-accent'] }))
export const NOCTURNE_PACKAGES: NocturnePackage[] = data.packages
export const NOCTURNE_BLOCKS: NocturneBlock[] = data.blocks
/** The accents "Make it yours" offers besides the kit's own. */
export const NOCTURNE_SWATCHES: string[] = data.swatches
