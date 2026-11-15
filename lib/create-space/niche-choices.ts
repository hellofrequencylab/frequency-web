// A server builds these nine serializable choices from the existing door/config bridge.
// The client resolver imports no marketing copy, pricing catalog, database or framework IO.
import { isMegaNicheId, type MegaNicheId } from '@/lib/theme/mega-theme'
import { parseIntents } from '@/lib/spaces/create-wizard'
import { listModeChoices } from '@/lib/spaces/modes'
import { goalsFromDoor } from './door'

type IntentId = ReturnType<typeof parseIntents>[number]
export interface NicheChoice {
  slug: string
  label: string
  niche: MegaNicheId
  mode: string
  goals: IntentId[]
}
interface NicheSeed { niche: MegaNicheId; mode: string; goals: IntentId[] }
interface Destination { mode: string; url?: string }
type ConfigReader = (slug: string) => { niche: string } | undefined

// These are the owner's nine public doors, not the distinct stored funnel sequence IDs.
const DOORS = [
  ['coaches-and-healers', 'Coaches and healers'],
  ['studios', 'Studios'],
  ['event-hosts', 'Event hosts'],
  ['venues', 'Venues'],
  ['nonprofits', 'Nonprofits'],
  ['networks', 'Networks'],
  ['local-businesses', 'Local businesses'],
  ['clubs-and-groups', 'Clubs and groups'],
  ['spiritual-community', 'Spiritual community'],
] as const
const MODES = new Map(listModeChoices().map((choice) => [choice.id, choice]))
const validMode = (raw: unknown): raw is string => typeof raw === 'string' && MODES.has(raw)

/** Registered Mode/Focus only, shared by draft parsing and the final server provisioning boundary. */
export function nicheModeChoice(raw: unknown) {
  return typeof raw === 'string' ? MODES.get(raw) ?? null : null
}

/** Called by a server boundary with getFunnelConfig and NICHE_FUNNEL_DESTINATIONS.
 *  Only the resulting bounded choices need to cross into the builder client. */
export function buildNicheChoices(readConfig: ConfigReader, destinations: Readonly<Record<string, Destination>>): NicheChoice[] {
  return DOORS.flatMap(([slug, label]) => {
    const niche = readConfig(slug)?.niche
    if (!isMegaNicheId(niche) || !Object.hasOwn(destinations, niche)) return []
    const destination = destinations[niche]
    if (destination.mode !== 'direct' || typeof destination.url !== 'string') return []
    try {
      const url = new URL(destination.url, 'https://frequencylocal.com')
      const mode = url.searchParams.get('mode')
      if (url.origin !== 'https://frequencylocal.com' || url.pathname !== '/spaces/new' || url.username || url.password || url.hash || !validMode(mode)) return []
      return [{ slug, label, niche, mode, goals: goalsFromDoor(mode, null) }]
    } catch { return [] }
  })
}

/** Resolve a public door slug or its legacy stored niche. A valid explicit URL mode wins.
 *  A manual chip click omits explicitMode so that choice seeds its exact configured mode. */
export function resolveNicheSeed(choices: readonly NicheChoice[], rawNiche: unknown, explicitMode?: unknown): NicheSeed | null {
  if (typeof rawNiche !== 'string') return null
  const choice = choices.find((row) => row.slug === rawNiche || row.niche === rawNiche)
  if (!choice) return null
  const mode = validMode(explicitMode) ? explicitMode : choice.mode
  return { niche: choice.niche, mode, goals: goalsFromDoor(mode, null) }
}

/** A typed sentence adds goals. It never changes the separately retained niche or mode. */
export function mergeNicheGoals(seedGoals: readonly string[], typedGoals: unknown): IntentId[] {
  return parseIntents([...seedGoals, ...(Array.isArray(typedGoals) ? typedGoals : [])])
}
