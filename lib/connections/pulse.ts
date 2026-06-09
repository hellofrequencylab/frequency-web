import { getMyOrbit, getNearMisses, type OrbitMember, type NearMiss } from '@/lib/connections/resonance'
import { getWelcomeTargets, type WelcomeTarget } from '@/lib/connections/welcomes'
import { getConnectionSettings } from '@/lib/connections/connection-settings'

// "Connections this week" (ADR-186, P5) — the proactive pulse that turns a directory
// into an agenda. Aggregates three reasons to act, reusing the existing engine:
//   • reconnect    — friends who've drifted to your outer orbit
//   • nearMisses   — people you keep crossing paths with but haven't met
//   • welcome      — newcomers in your circles to greet (earns gems)
// Each list is gated by the relevant platform toggle and capped small (it's a nudge,
// not a feed). Everything here is the caller's own private read.

export interface ConnectionsPulse {
  reconnect: OrbitMember[]
  nearMisses: NearMiss[]
  welcome: WelcomeTarget[]
  /** True when there's nothing to surface — callers can skip rendering. */
  empty: boolean
}

export async function getConnectionsPulse(perList = 4): Promise<ConnectionsPulse> {
  const settings = await getConnectionSettings()
  const [orbit, near, welcome] = await Promise.all([
    settings.resonanceEnabled ? getMyOrbit(100) : Promise.resolve([] as OrbitMember[]),
    settings.nearMissEnabled ? getNearMisses(perList * 2) : Promise.resolve([] as NearMiss[]),
    getWelcomeTargets(perList * 2),
  ])

  // Drifted friends first: outer orbit, then the lowest-resonance of the rest.
  const reconnect = orbit
    .filter((m) => m.orbit === 'outer')
    .sort((a, b) => a.resonance - b.resonance)
    .slice(0, perList)

  const nearMisses = near.slice(0, perList)
  const welcomeList = welcome.slice(0, perList)

  return {
    reconnect,
    nearMisses,
    welcome: welcomeList,
    empty: reconnect.length === 0 && nearMisses.length === 0 && welcomeList.length === 0,
  }
}
