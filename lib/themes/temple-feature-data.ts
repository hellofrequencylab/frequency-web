// Temple Theme Kit data for the /themes/temple feature page. Read from the Temple design system
// (profile names and who they are for from lib/sites/kits/temple-kit-profile-index.ts, accents from lib/theme/temple-kit.ts) into temple-feature-data.json, trimmed to what the page
// reads (JSON because each profile accent is colour data, the way Nocturne's is). The pictures are renders of the
// kit's own surfaces, stored under public/themes/temple-kit (shots and layouts): the thirteen profile websites
// through the real chrome and blocks, and the Spotlight layouts through the real Spotlight shell. The id of each
// profile equals the Wizard niche (lib/theme/mega-theme.ts).
import data from './temple-feature-data.json'

interface TempleKit {
  id: string
  name: string
  hex: string
  who: string
}
interface TempleLayout {
  id: string
  name: string
  sub: string
}

/** The four surfaces a preview can show. Website and Spotlight have pictures; Space and Email are on the way and
 *  show a quiet frame (no picture exists for them yet, and none is invented). */
export type TempleSurface = 'site' | 'spotlight' | 'space' | 'email'
export const TEMPLE_SURFACES: readonly { id: TempleSurface; label: string; qual?: string; shot: 'site' | 'spot' | 'spacedesk' | 'email'; width: number; height: number }[] = [
  { id: 'site', label: 'Website', shot: 'site', width: 1280, height: 800 },
  { id: 'spotlight', label: 'Spotlight', qual: 'Link Page', shot: 'spot', width: 740, height: 1648 },
  { id: 'space', label: 'Space', qual: 'Profile', shot: 'spacedesk', width: 1280, height: 770 },
  { id: 'email', label: 'Email template', shot: 'email', width: 900, height: 1140 },
]

export const TEMPLE_SPOTLIGHT_EYEBROW: string = data.eyebrow
export const TEMPLE_KITS: TempleKit[] = data.kits
export const TEMPLE_LAYOUTS: TempleLayout[] = data.layouts
export const TEMPLE_DEFAULT_KIT = 'general'

export const templeShot = (kit: string, shot: string): string => `/themes/temple-kit/shots/${kit}-${shot}.jpg`
export const templeLayoutShot = (id: string): string => `/themes/temple-kit/layouts/${id}.jpg`
