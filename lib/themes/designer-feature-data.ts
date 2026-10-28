// Designer Theme Kit data for the /themes/designer feature page. Read from the Designer design system
// (ui_kits/site/kits.js) into designer-feature-data.json, trimmed to what the page reads (JSON because each
// kit accent is colour data, the way Nocturne's is). Every picture is a render of the design system's own kit
// surfaces, stored under public/themes/designer/shots. The id of each profile equals the Wizard niche
// (lib/theme/mega-theme.ts), so every adopt button goes to /spaces/new?niche=<id>.
import data from './designer-feature-data.json'

export interface DesignerKit {
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
interface DesignerPackage {
  id: string
  name: string
  stage: string
  blurb: string
  locked: boolean
}
interface DesignerBlock {
  id: string
  name: string
  pkg: string
  stage: string
}

export const DESIGNER_KITS: DesignerKit[] = data.kits
export const DESIGNER_PACKAGES: DesignerPackage[] = data.packages
export const DESIGNER_BLOCKS: DesignerBlock[] = data.blocks
/** The accents "Make it yours" offers besides the kit's own. */
export const DESIGNER_SWATCHES: string[] = data.swatches
