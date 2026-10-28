// Designer Theme Kit data for the /themes/designer feature page. Read from the Designer design system
// (ui_kits/site/kits.js and Spotlight Layouts.html) into designer-feature-data.json, trimmed to what the page
// reads (JSON because each kit accent is colour data, the way Nocturne's is). Every picture is a render of the
// design system's own kit surfaces, stored under public/themes/designer (shots and layouts). The id of each
// profile equals the Wizard niche (lib/theme/mega-theme.ts).
import data from './designer-feature-data.json'

export interface DesignerKit {
  id: string
  name: string
  hex: string
  who: string
}
export interface DesignerLayout {
  id: string
  name: string
  sub: string
}

/** The four surfaces a preview can show, and the picture each one reads. */
export type DesignerSurface = 'site' | 'spotlight' | 'space' | 'email'
export const DESIGNER_SURFACES: readonly { id: DesignerSurface; label: string; shot: 'site' | 'spot' | 'spacedesk' | 'email'; width: number; height: number }[] = [
  { id: 'site', label: 'Website', shot: 'site', width: 1280, height: 800 },
  { id: 'spotlight', label: 'Spotlight', shot: 'spot', width: 740, height: 1648 },
  { id: 'space', label: 'Space', shot: 'spacedesk', width: 1280, height: 770 },
  { id: 'email', label: 'Email', shot: 'email', width: 900, height: 1140 },
]

export const DESIGNER_SPOTLIGHT_EYEBROW: string = data.eyebrow
export const DESIGNER_KITS: DesignerKit[] = data.kits
export const DESIGNER_LAYOUTS: DesignerLayout[] = data.layouts
export const DESIGNER_DEFAULT_KIT = 'general'

export const designerShot = (kit: string, shot: string): string => `/themes/designer/shots/${kit}-${shot}.jpg`
export const designerLayoutShot = (id: string): string => `/themes/designer/layouts/${id}.jpg`
