import { FREE_HUMAN_PROFILES } from '@/lib/theme/free-human'
import { MEGA_NICHES } from '@/lib/theme/mega-theme'
import { NICHE_SPECS } from './niche-spec'
import type { KitNiche, SiteKit } from './types'

interface KitSummary { id: string; niche: KitNiche; theme: SiteKit['theme']; label: string; description: string }

/** The Free Human Theme Kit's thirteen profile kits for the editor's kit library, `free-human-<niche>`. Labels are the design
 *  system's profile names (lib/theme/free-human.ts); descriptions are each niche's own words (niche-spec.ts), so the kit says
 *  who it is for in the same voice every other theme does. */
export const FREE_HUMAN_PROFILE_KIT_INDEX: readonly KitSummary[] = MEGA_NICHES.map((niche) => ({
  id: `free-human-${niche}`,
  niche,
  theme: 'FreeHuman',
  label: FREE_HUMAN_PROFILES[niche].label,
  description: niche === 'general' ? 'A circle, a year of gatherings and a calendar people can follow: what is coming, how to join and a list to stay in touch.' : NICHE_SPECS[niche].description,
}))
