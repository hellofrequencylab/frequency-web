import type { KitNiche, SiteKit } from './types'

// Kit CONTENT is loaded on demand, only by the editor and the apply step. The public site never imports
// this file, so kit copy is not traced into every hosted route (DEPLOY-SAFETY: shared-module fan-out).
const LOADERS: Record<string, () => Promise<SiteKit>> = {
  'wildheart-coaches': () => import('./wildheart-coaches').then((m) => m.default),
  'temple-venues': () => import('./temple-venues').then((m) => m.default),
}

interface KitSummary { id: string; niche: KitNiche; theme: SiteKit['theme']; label: string; description: string }

/** Light index for the library screen; no page content. */
export const KIT_INDEX: readonly KitSummary[] = [
  { id: 'temple-venues', niche: 'venues', theme: 'Temple', label: 'Venues and community houses', description: 'A home for gatherings, a standing week, membership and space to rent.' },
  { id: 'wildheart-coaches', niche: 'coaches', theme: 'Wildheart', label: 'Coaches and healers', description: 'Your story, how you work, what you offer and a way to book.' },
]

export async function loadKit(id: string): Promise<SiteKit | null> {
  const load = Object.hasOwn(LOADERS, id) ? LOADERS[id] : undefined
  return load ? load() : null
}
