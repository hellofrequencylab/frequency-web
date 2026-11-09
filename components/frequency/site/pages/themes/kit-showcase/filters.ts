// The Theme Kits page's filters (LIVE-1866): the look (the design's own), the register and what is ready today. The last two read
// the theme's manifest first (lib/themes/library.ts themeCatalogFacts) and fall back to the card's own data for a theme whose
// manifest says nothing yet. PURE: no React.
import { themeCatalogFacts, type ThemeRegisters } from '@/lib/themes/library'

type SurfaceKey = 'website' | 'spotlight' | 'email' | 'space'
export type ReadyFilter = 'all' | SurfaceKey
export type RegisterFilter = 'all' | ThemeRegisters

export const REGISTER_FILTERS: readonly [RegisterFilter, string][] = [['night', 'Night'], ['day', 'Day'], ['both', 'Both']]
export const READY_FILTERS: readonly [ReadyFilter, string][] = [['website', 'Website'], ['spotlight', 'Spotlight'], ['email', 'Email'], ['space', 'Space']]

interface KitFacts {
  ready: Record<SurfaceKey, boolean>
  registers: ThemeRegisters
}

/** The card as the design wrote it: `reg` light|dark, `modes` 1|2, `status` per surface. */
interface KitCard {
  reg: string
  modes: number
  status: Record<string, number | boolean>
}

/** What a kit can do, from its manifest where the manifest speaks, else from the card. */
export function kitFacts(card: KitCard, themeId: string | null): KitFacts {
  const m = themeId ? themeCatalogFacts(themeId) : null
  const own: Record<SurfaceKey, boolean> = { website: !!card.status.website, spotlight: !!card.status.spotlight, email: !!card.status.email, space: !!card.status.space }
  return {
    ready: m?.ready ?? own,
    registers: m?.registers ?? (card.modes === 2 ? 'both' : card.reg === 'dark' ? 'night' : 'day'),
  }
}

/** Night shows every kit that can be night (including both); Both shows only the kits that carry both registers. */
export function kitMatches(f: KitFacts, filters: { register: RegisterFilter; ready: ReadyFilter }): boolean {
  const reg = filters.register === 'all' || f.registers === filters.register || (filters.register !== 'both' && f.registers === 'both')
  const ready = filters.ready === 'all' || f.ready[filters.ready]
  return reg && ready
}
