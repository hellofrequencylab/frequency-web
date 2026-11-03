// New World data for the /themes/new-world feature page (LIVE-2059). The seven kits come from the kit index
// (lib/sites/kits/new-world-profile-index.ts), the accent from the theme's own tokens (lib/theme/new-world.ts: Tide is the only
// shipped accent, so every kit chip wears it). The pictures are renders of the kit's own surfaces, stored under public/brand/new-world-kit:
// the Website through the real site chrome and blocks, the Spotlight through the real layout, the Space inside the real member shell
// and the Email through the real email module (scripts/render/new-world-theme-shots.render.tsx and new-world-space-shots.render.tsx).
import { NEW_WORLD_KIT_INDEX } from '@/lib/sites/kits/new-world-profile-index'
import { NEW_WORLD_ACCENTS } from '@/lib/theme/new-world'

interface NewWorldFeatureKit {
  id: string
  name: string
  hex: string
  who: string
}

/** The four surfaces a preview can show. All four have a real render for every kit. */
export type NewWorldSurface = 'site' | 'spotlight' | 'space' | 'email'
export const NEW_WORLD_SURFACES: readonly { id: NewWorldSurface; label: string; qual?: string; shot: 'site' | 'spot' | 'spacedesk' | 'email'; width: number; height: number }[] = [
  { id: 'site', label: 'Website', shot: 'site', width: 1280, height: 800 },
  { id: 'spotlight', label: 'Spotlight', qual: 'Link Page', shot: 'spot', width: 780, height: 1688 },
  { id: 'space', label: 'Space', qual: 'Profile', shot: 'spacedesk', width: 1280, height: 770 },
  { id: 'email', label: 'Email template', shot: 'email', width: 900, height: 1140 },
]

export const NEW_WORLD_KITS: NewWorldFeatureKit[] = NEW_WORLD_KIT_INDEX.map((k) => ({ id: k.niche, name: k.label, hex: NEW_WORLD_ACCENTS.tide.accent, who: k.description }))
export const NEW_WORLD_DEFAULT_KIT = 'general'

export const newWorldShot = (kit: string, shot: string): string => `/brand/new-world-kit/shots/${kit}-${shot}.jpg`
/** The six Spotlight layouts, drawn for the General kit. */
export const newWorldLayoutShot = (id: string): string => `/brand/new-world-kit/layouts/${id}.jpg`
