// Network Theme Kit data for the /themes/network feature page. Read from the Network design system
// (ui_kits/site/kits.js and Spotlight Layouts.html) into network-feature-data.json, trimmed to what the page
// reads (JSON because each profile accent is colour data, the way Nocturne's is). The pictures are renders of the
// kit's own surfaces, stored under public/themes/network-kit (shots and layouts): the thirteen profile websites
// through the real chrome and blocks, and the Spotlight layouts through the real Spotlight shell. The id of each
// profile equals the Wizard niche (lib/theme/mega-theme.ts).
import data from './network-feature-data.json'

interface NetworkKit {
  id: string
  name: string
  hex: string
  who: string
}
interface NetworkLayout {
  id: string
  name: string
  sub: string
}

/** The four surfaces a preview can show, and the picture each one reads (the same four as Designer's). */
export type NetworkSurface = 'site' | 'spotlight' | 'space' | 'email'
export const NETWORK_SURFACES: readonly { id: NetworkSurface; label: string; qual?: string; shot: 'site' | 'spot' | 'spacedesk' | 'email'; width: number; height: number }[] = [
  { id: 'site', label: 'Website', shot: 'site', width: 1280, height: 800 },
  { id: 'spotlight', label: 'Spotlight', qual: 'Link Page', shot: 'spot', width: 740, height: 1648 },
  { id: 'space', label: 'Space', qual: 'Profile', shot: 'spacedesk', width: 1280, height: 770 },
  { id: 'email', label: 'Email template', shot: 'email', width: 900, height: 1140 },
]

export const NETWORK_SPOTLIGHT_EYEBROW: string = data.eyebrow
export const NETWORK_KITS: NetworkKit[] = data.kits
export const NETWORK_LAYOUTS: NetworkLayout[] = data.layouts
export const NETWORK_DEFAULT_KIT = 'general'

export const networkShot = (kit: string, shot: string): string => `/themes/network-kit/shots/${kit}-${shot}.jpg`
export const networkLayoutShot = (id: string): string => `/themes/network-kit/layouts/${id}.jpg`
