// THE SIGNED-OUT DOOR (LIVE-1969, ADR-1933). Every way into creating a Space already converges on one address,
// /spaces/new (lib/site.ts OPERATOR_CTA_HREF, the pricing buttons, the /for doors' Start free, two /go doors, the
// funnel completion). That page keeps its one job for a member: into the launch. For a visitor with no account it
// used to bounce to /sign-in; now it opens /create-a-space, the wizard that needs no account, carrying what the door
// already knew so the builder starts primed. No door gets a second destination: the doors do not change, the page
// behind them does.
//
// PURE and client-safe: the page builds the address here, and the builder reads it back here, so the two halves
// cannot disagree about a key. Everything is a hint: an unknown value is dropped, never an error.
//
//   kit      the Theme Kit (?kit= from a /themes page, or ?theme= as /spaces/new names it)
//   accent   the accent picked beside that kit's Use button, by name or hex (lib/create-space/preview-site.ts kitAccentIndex)
//   mode     a Space Mode id (`business:appointments`) from a /go or /for door; it primes the goals
//   intents  the pricing calculator's picks, `a,b`
//   niche    the Mega niche the door named; rides to the launch hold (lib/launch/pending.ts)
//   name     the pricing calculator's "what is it called"

import { WIZARD_INTENTS, parseIntents } from '@/lib/spaces/create-wizard'
import { isMegaNicheId, type MegaNicheId, type MegaThemeId } from '@/lib/theme/mega-theme'
import { isPreviewKit, kitAccentIndex } from './preview-site'
import { PREVIEW_KIT_ORDER } from '@/lib/theme/preview-tokens'

type IntentId = (typeof WIZARD_INTENTS)[number]['id']

/** What the builder starts from when a door opened it. */
export interface DoorArrival {
  kit: MegaThemeId
  /** The visitor arrived having chosen the kit, as opposed to previewing the house one. */
  chosen: boolean
  /** The accent picked beside the kit's Use button, as its place in the kit's list; absent when none was named. */
  accentAt?: number
  name: string
  goals: IntentId[]
  niche: MegaNicheId | null
}

/** The kit a cold visit starts on: New World once it is offered (Daniel, 2026-11-03), the house look until then. */
export const COLD_KIT: MegaThemeId = PREVIEW_KIT_ORDER.includes('new-world') ? 'new-world' : 'frequency'

const NAME_MAX = 80
const MODE_RE = /^[a-z]+:[a-z]+$/

const one = (v: string | string[] | null | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ''

/** The modes no goal starts on its own (lib/funnels/definitions.ts names them for the coaches and general doors), and
 *  the nearest goal: a package and a service are both booked. */
const NEAREST_GOAL: Readonly<Record<string, IntentId>> = { 'business:packages': 'bookings', 'business:service': 'bookings' }

/** The goals a door's mode and the calculator's picks name, in catalog order, deduped. Total. */
export function goalsFromDoor(mode: string | null | undefined, intents: string | null | undefined): IntentId[] {
  const picked = new Set<string>(parseIntents((intents ?? '').split(',')))
  if (mode) {
    for (const i of WIZARD_INTENTS) if (i.mode === mode) picked.add(i.id)
    if (NEAREST_GOAL[mode]) picked.add(NEAREST_GOAL[mode])
  }
  return WIZARD_INTENTS.filter((i) => picked.has(i.id)).map((i) => i.id)
}

/** Read a door's hints off an address. `get` is URLSearchParams.get or a server page's params. Total. */
export function doorArrival(get: (key: string) => string | string[] | null | undefined): DoorArrival {
  const kitParam = one(get('kit')) || one(get('theme'))
  const kit = isPreviewKit(kitParam) ? kitParam : null
  const niche = one(get('niche'))
  return {
    kit: kit ?? COLD_KIT,
    chosen: kit !== null,
    accentAt: (kit ? kitAccentIndex(kit, one(get('accent'))) : null) ?? undefined,
    name: one(get('name')).trim().slice(0, NAME_MAX),
    goals: goalsFromDoor(one(get('mode')) || null, one(get('intents')) || null),
    niche: isMegaNicheId(niche) ? niche : null,
  }
}

/** The /create-a-space address a signed-out arrival at /spaces/new is sent to, carrying only the hints the builder
 *  reads. The plain address when the door knew nothing. Total. */
export function createSpaceDoorHref(params: Record<string, string | string[] | undefined>): string {
  const get = (k: string) => params[k]
  const a = doorArrival(get)
  const q = new URLSearchParams()
  if (a.chosen) q.set('kit', a.kit)
  if (a.chosen && a.accentAt !== undefined) q.set('accent', one(get('accent')).trim().toLowerCase())
  const mode = one(get('mode'))
  if (MODE_RE.test(mode) && goalsFromDoor(mode, null).length) q.set('mode', mode)
  const intents = parseIntents(one(get('intents')).split(','))
  if (intents.length) q.set('intents', intents.join(','))
  if (a.niche) q.set('niche', a.niche)
  if (a.name) q.set('name', a.name)
  const s = q.toString()
  return s ? `/create-a-space?${s}` : '/create-a-space'
}
