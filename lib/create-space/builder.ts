// The rules of the signed-out builder on /create-a-space (docs/design-systems/create-a-space, v3). PURE and
// client-safe: the five steps, the progress meter, the handle, the tools a pick switches on, and the draft a visitor
// leaves behind in their own browser. Nothing here touches a database; the account comes at the last step, and the
// draft leaves the browser once at step 3 (ADR-1933) and once more at the hand-over (lib/create-space/handoff.ts).

import { WIZARD_INTENTS, suggestModeForIntents } from '@/lib/spaces/create-wizard'
import { slugify } from '@/lib/utils'
import { OFFER_MAX } from '@/lib/create-space/intents-from-offer'
import { isPreviewKit } from '@/lib/create-space/preview-site'
import { isMegaNicheId, type MegaNicheId, type MegaThemeId } from '@/lib/theme/mega-theme'

/** The four moves answered in the builder; the fifth (save) is the account step. */
export const BUILDER_MOVES = ['name', 'offer', 'contact', 'photos'] as const
export type BuilderMove = (typeof BUILDER_MOVES)[number]

type IntentId = (typeof WIZARD_INTENTS)[number]['id']

/** Which logo the preview wears: the name in the kit's display face, the initial on the accent, or an upload. */
type LogoChoice = 'word' | 'mono' | 'up'

export interface BuilderDraft {
  kit: MegaThemeId
  /** The visitor picked the kit (a ?kit= arrival or a tap), as opposed to the default being previewed. */
  kitChosen: boolean
  accentAt: number
  /** Next is locked until an accent is picked, and no swatch shows as selected before then. */
  accentPicked: boolean
  name: string
  /** A handle the visitor typed; empty means "follow the name". */
  slug: string
  /** Their one sentence about what they offer, at most OFFER_MAX characters. */
  offer: string
  /** The goals the sentence named (intentsFromOffer), editable later on the launch. */
  goals: IntentId[]
  /** The Mega niche the door named (lib/create-space/door.ts); rides to the launch hold, never asked here. */
  niche: MegaNicheId | null
  hostName: string
  email: string
  phone: string
  where: string
  /** A cover slot (s0, s1...) from the kit's covers, or `up` for their own upload. */
  cover: string
  logo: LogoChoice
  /** A portrait slot (s0...), `initials`, or `up`. */
  profile: string
  /** ISO time of the first keystroke; the clock counts from it, and a reload does not reset it. */
  startedAt: string | null
  /** ISO time of the save, so the saved headline can say how long it took. */
  endedAt: string | null
  /** The server draft's token, once step 3 has saved it (lib/create-space/lead). */
  leadToken: string | null
  done: Record<BuilderMove, boolean>
}

export const DRAFT_KEY = 'fq-create-space-draft-v2'
/** The v1 key: a draft from before the v3 builder is read once and upgraded, never written again. */
const DRAFT_KEY_V1 = 'fq-create-space-draft-v1'

export function emptyDraft(kit: MegaThemeId, kitChosen: boolean): BuilderDraft {
  return {
    kit, kitChosen, accentAt: 0, accentPicked: false, name: '', slug: '', offer: '', goals: [], niche: null, hostName: '', email: '', phone: '', where: '',
    cover: 's0', logo: 'word', profile: 's0', startedAt: null, endedAt: null, leadToken: null,
    done: { name: false, offer: false, contact: false, photos: false },
  }
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

/** The weights of the meter (README section 6): the kit, the four moves, and saving with an account. */
const WEIGHTS = { kit: 10, name: 20, offer: 25, contact: 20, photos: 15, saved: 10 } as const

/** How much of the Space is built, 10 to 90 from the kit and the four moves, 100 once it is saved. The last step
 *  (the Space going live) happens on the launch page, so the meter here reads "built", never "live". */
export function progressOf(draft: BuilderDraft, saved = false): number {
  const d = draft.done
  return WEIGHTS.kit + (d.name ? WEIGHTS.name : 0) + (d.offer ? WEIGHTS.offer : 0) + (d.contact ? WEIGHTS.contact : 0) + (d.photos ? WEIGHTS.photos : 0) + (saved ? WEIGHTS.saved : 0)
}

/** The next move still open after `from`, wrapping round; null when all four are done. */
export function nextOpenMove(done: Record<BuilderMove, boolean>, from: number): number | null {
  for (let i = from + 1; i < BUILDER_MOVES.length; i++) if (!done[BUILDER_MOVES[i]]) return i
  for (let i = 0; i < BUILDER_MOVES.length; i++) if (!done[BUILDER_MOVES[i]]) return i
  return null
}

/** The five segments of the steps bar, in order, with the short label each shows in the intro. */
export const STEP_SEGMENTS: readonly { label: string; short: string }[] = [
  { label: 'Name it and pick an accent', short: '01 Name it' },
  { label: 'What you offer', short: '02 What you offer' },
  { label: 'How clients find you', short: '03 Get found' },
  { label: 'Photos', short: '04 Photos' },
  { label: 'Save', short: '05 Save' },
]

/** The prompt under the H1 for each step (README section 3). */
export function stepPrompt(step: number, kitLabel: string): string {
  return [
    'Pick an accent and watch your buttons change, then hit Next.',
    'One sentence is plenty. We mock up your headline, offerings and Spotlight from it.',
    'This fills in your contact section and Spotlight. Your draft saves to this email too.',
    `These suit the ${kitLabel} theme. Swap in your own, or keep them for now.`,
    'Save it and claim your handle. Nothing is public until you activate it.',
  ][step] ?? ''
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

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const iso = (v: unknown) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null)
const PHOTO_SLOT = /^(s\d|up|initials)$/

/** Read a stored draft back. Total: anything unexpected is ignored, and a draft started on another kit is not resumed
 *  when the visitor arrived with one (`?kit=` wins). A v1 draft (before the v3 builder) is upgraded: its look move
 *  becomes the accent pick, its goals keep the offer step done with no sentence, and its host becomes the host's name. */
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
  const v1 = !('offer' in o) && ('look' in done || 'host' in done)
  const logo = o.logo === 'mono' || o.logo === 'up' ? o.logo : 'word'
  return {
    kit: o.kit,
    kitChosen: o.kitChosen === true,
    accentAt,
    accentPicked: v1 ? done.look === true : o.accentPicked === true,
    name: text(o.name, 80),
    slug: cleanHandleInput(text(o.slug, 40)),
    offer: text(o.offer, OFFER_MAX),
    goals,
    niche: isMegaNicheId(o.niche) ? o.niche : null,
    hostName: text(o.hostName, 80),
    email: text(o.email, 254),
    phone: text(o.phone, 30),
    where: text(o.where, 80),
    cover: PHOTO_SLOT.test(text(o.cover, 8)) ? text(o.cover, 8) : 's0',
    logo,
    profile: PHOTO_SLOT.test(text(o.profile, 8)) ? text(o.profile, 8) : 's0',
    startedAt: iso(o.startedAt),
    endedAt: iso(o.endedAt),
    leadToken: typeof o.leadToken === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(o.leadToken) ? o.leadToken : null,
    done: {
      name: done.name === true,
      offer: v1 ? goals.length > 0 : done.offer === true,
      // A v1 draft never held an email, so its host move does not count as the contact step.
      contact: v1 ? false : done.contact === true,
      photos: done.photos === true,
    },
  }
}

/** The stored draft, from the v2 key or (once) the v1 key. Total. */
export function readStoredDraft(read: (key: string) => string | null, arrivedKit: MegaThemeId | null): BuilderDraft | null {
  return parseDraft(read(DRAFT_KEY), arrivedKit) ?? parseDraft(read(DRAFT_KEY_V1), arrivedKit)
}

export function serializeDraft(draft: BuilderDraft): string {
  return JSON.stringify(draft)
}

/** Whether a draft holds anything worth a "Welcome back". */
export function hasProgress(draft: BuilderDraft): boolean {
  return Boolean(draft.name.trim() || draft.offer || draft.hostName || draft.email || draft.accentPicked)
}

/** The host's initial for the monogram and the initials avatar: the host's, else the business's, else Y. */
export function initialOf(hostName: string, siteName: string): string {
  return (hostName.trim()[0] ?? siteName.trim()[0] ?? 'Y').toUpperCase()
}
