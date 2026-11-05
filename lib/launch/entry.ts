// THE FREE SPOTLIGHT DOORWAY (VLS-05). One label and one address for every "Get a Free Spotlight" button, so
// the home page, the /for doors, the Theme Kit pages and the landing all say the same words and send people to
// the same place. The first-touch cookie (lib/attribution/first-touch.ts) reads the utm values on arrival, so
// the button only has to carry them: utm_medium names where it was seen, utm_content the door or kit.
// Pure and client-safe. Whether the button shows at all is launchEntryEnabled() in ./enabled.ts.

export const FREE_SPOTLIGHT_LABEL = 'Get a Free Spotlight'
const FREE_SPOTLIGHT_CAMPAIGN = 'free-spotlight'

type FreeSpotlightSurface = 'home' | 'door' | 'themes' | 'theme' | 'landing'

/** Where the button lands, with where it was pressed. `detail` is the door or kit (a short slug). */
export function freeSpotlightHref(surface: FreeSpotlightSurface, detail?: string, kit?: string | null, accent?: string | null): string {
  const q = new URLSearchParams({ utm_source: 'site', utm_medium: surface, utm_campaign: FREE_SPOTLIGHT_CAMPAIGN })
  if (detail && /^[a-z0-9-]{1,40}$/.test(detail)) q.set('utm_content', detail)
  // The Theme Kit the button sat on. /launch/start holds it for the launch; signed out, the hop to /create-a-space
  // carries the query and the builder reads ?kit= (lib/create-space/door.ts).
  if (kit && /^[a-z0-9-]{1,40}$/.test(kit)) q.set('kit', kit)
  // The accent picked beside it, by name: /launch/start holds it with the kit, the builder reads ?accent=.
  if (kit && accent && /^[a-z0-9-]{1,40}$/i.test(accent)) q.set('accent', accent.toLowerCase())
  return `/launch/start?${q.toString()}`
}
