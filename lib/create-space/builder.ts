// The rules of the signed-out builder on /create-a-space (docs/design-systems/create-a-space). PURE and client-safe:
// the five moves, the progress meter, the handle, the tools a pick switches on, and the draft a visitor leaves
// behind in their own browser. Nothing here touches a database; the account comes at the last step.

import { WIZARD_INTENTS, suggestModeForIntents } from '@/lib/spaces/create-wizard'
import { slugify } from '@/lib/utils'
import { isPreviewKit } from '@/lib/create-space/preview-site'
import type { MegaThemeId } from '@/lib/theme/mega-theme'

/** The four moves answered in the builder; the fifth (save) is the account step. */
export const BUILDER_MOVES = ['name', 'look', 'goals', 'host'] as const
export type BuilderMove = (typeof BUILDER_MOVES)[number]

type IntentId = (typeof WIZARD_INTENTS)[number]['id']

export interface BuilderDraft {
  kit: MegaThemeId
  /** The visitor picked the kit (a ?kit= arrival or a tap), as opposed to the default being previewed. */
  kitChosen: boolean
  accentAt: number
  name: string
  /** A handle the visitor typed; empty means "follow the name". */
  slug: string
  goals: IntentId[]
  hostName: string
  done: Record<BuilderMove, boolean>
}

export function emptyDraft(kit: MegaThemeId, kitChosen: boolean): BuilderDraft {
  return { kit, kitChosen, accentAt: 0, name: '', slug: '', goals: [], hostName: '', done: { name: false, look: false, goals: false, host: false } }
}

/** A handle from a name: lowercase letters and digits only, 40 at most. "Saltwater Collective" is saltwatercollective. */
export function handleFromName(name: string): string {
  return slugify(name).replace(/-/g, '').slice(0, 40)
}

/** The handle shown and sent: the typed one, else the one the name makes, else the sample. */
export function handleOf(draft: Pick<BuilderDraft, 'name' | 'slug'>): string {
  return draft.slug || handleFromName(draft.name) || 'yourspace'
}

/** The handle the visitor would actually claim: the typed one, else the one the name makes, else nothing (a name of
 *  symbols makes none). Unlike handleOf it never falls back to the sample, which is for display only. */
export function claimedHandle(draft: Pick<BuilderDraft, 'name' | 'slug'>): string {
  return draft.slug || handleFromName(draft.name)
}

/** Letters, digits and single hyphens inside; the same shape the Space route accepts. */
export function isValidHandle(handle: string): boolean {
  return handle.length >= 2 && handle.length <= 40 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(handle)
}

/** What a typed handle becomes: lowercased, spaces dropped. */
export function cleanHandleInput(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, '').slice(0, 40)
}

const WEIGHTS = { kit: 15, name: 25, look: 20, goals: 15, host: 10 } as const

/** What saving with an account adds. The last 5 of the 100 is the Space going live, which happens on the launch page
 *  and not here, so the ring on this page stops at 95. */
const SAVE_WEIGHT = 10

/** How much of the Space is built, 0 to 85 from the four moves and the kit, 95 once it is saved. */
export function progressOf(draft: BuilderDraft, saved = false): number {
  const d = draft.done
  return (draft.kitChosen ? WEIGHTS.kit : 0) + (d.name ? WEIGHTS.name : 0) + (d.look ? WEIGHTS.look : 0) + (d.goals ? WEIGHTS.goals : 0) + (d.host ? WEIGHTS.host : 0) + (saved ? SAVE_WEIGHT : 0)
}

interface MeterStop {
  label: string
  on: boolean
  now: boolean
}

/** The five milestones under the ring: the first one not done is "now". */
export function meterOf(draft: BuilderDraft, building: boolean): MeterStop[] {
  const d = draft.done
  const stops: [string, boolean][] = [
    ['Theme Kit', draft.kitChosen],
    ['Space page', d.name],
    ['Website + Spotlight', d.name && d.look],
    ['Tools', d.goals],
    ['Host profile', d.host],
  ]
  const current = building ? stops.findIndex(([, on]) => !on) : -1
  return stops.map(([label, on], i) => ({ label, on, now: !on && i === current }))
}

/** The width of the filled track, as a fraction of the way to the last stop. */
export function trackFraction(meter: readonly MeterStop[]): number {
  const last = meter.map((m) => m.on).lastIndexOf(true)
  return Math.max(0, last) / (meter.length - 1)
}

export function meterLabel(draft: BuilderDraft): string {
  const d = draft.done
  if (d.name && d.look && d.goals && d.host) return 'Ready to save'
  return progressOf(draft) >= 50 ? 'Built, keep going' : 'Built so far'
}

/** The next move still open after `from`, wrapping round; null when all four are done. */
export function nextOpenMove(done: Record<BuilderMove, boolean>, from: number): number | null {
  for (let i = from + 1; i < BUILDER_MOVES.length; i++) if (!done[BUILDER_MOVES[i]]) return i
  for (let i = 0; i < BUILDER_MOVES.length; i++) if (!done[BUILDER_MOVES[i]]) return i
  return null
}

interface StartingMode {
  label: string
  tools: readonly string[]
}

const MODES: Record<string, StartingMode> = {
  'business:service': { label: 'General', tools: ['Calendar and gatherings', 'Email and contacts', 'QR codes'] },
  'business:appointments': { label: 'Appointments', tools: ['Booking', 'Reviews', 'Email and contacts'] },
  'business:membership': { label: 'Memberships', tools: ['Memberships', 'Calendar and gatherings', 'Circles'] },
  'business:cohort': { label: 'Programs', tools: ['Journeys and practices', 'Circles', 'Email and contacts'] },
  'business:ticketed': { label: 'Ticketed events', tools: ['Calendar and gatherings', 'QR codes', 'Email and contacts'] },
  'business:product': { label: 'Shop', tools: ['Shop', 'Reviews', 'Email and contacts'] },
  'nonprofit:donations': { label: 'Nonprofit', tools: ['Donations', 'Circles', 'Email and contacts'] },
}

const GENERAL = 'business:service'

/** The setup and the three tools the picks switch on. The same rule the signed-in wizard uses; no pick is General. */
export function startingModeFor(goals: readonly string[]): StartingMode {
  return MODES[suggestModeForIntents(goals, Object.keys(MODES)) ?? GENERAL]
}

// ── The draft in the visitor's own browser ──────────────────────────────────────────────────────────

export const DRAFT_KEY = 'fq-create-space-draft-v1'

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Read a stored draft back. Total: anything unexpected is ignored, and a draft started on another kit is not resumed
 *  when the visitor arrived with one (`?kit=` wins). */
export function parseDraft(raw: string | null, arrivedKit: MegaThemeId | null): BuilderDraft | null {
  if (!raw) return null
  let v: unknown
  try { v = JSON.parse(raw) } catch { return null }
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!isPreviewKit(o.kit)) return null
  if (arrivedKit && o.kit !== arrivedKit) return null
  const done = (o.done && typeof o.done === 'object' ? o.done : {}) as Record<string, unknown>
  const goals = Array.isArray(o.goals) ? WIZARD_INTENTS.filter((i) => (o.goals as unknown[]).includes(i.id)).map((i) => i.id) : []
  const accentAt = typeof o.accentAt === 'number' && Number.isInteger(o.accentAt) && o.accentAt >= 0 && o.accentAt < 12 ? o.accentAt : 0
  return {
    kit: o.kit,
    kitChosen: o.kitChosen === true,
    accentAt,
    name: text(o.name, 80),
    slug: cleanHandleInput(text(o.slug, 40)),
    goals,
    hostName: text(o.hostName, 80),
    done: { name: done.name === true, look: done.look === true, goals: done.goals === true, host: done.host === true },
  }
}

export function serializeDraft(draft: BuilderDraft): string {
  return JSON.stringify(draft)
}

/** Whether a draft holds anything worth a "Start over". */
export function hasProgress(draft: BuilderDraft): boolean {
  return Boolean(draft.name || draft.hostName || draft.goals.length || draft.done.look)
}
