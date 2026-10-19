// REGULARS HUNTS, the pure half (LIVE-941, ADR-1781, docs/LOYALTY.md). Types, limits and the progress
// math the host editor, the public hunt page, the check-in result and /rewards all share. No Supabase,
// no Next: unit-tested in lib/loyalty/hunts.test.ts. The IO lives in ./hunt-store.ts and ./hunts-visit.ts.
//
// A hunt is a COLLECTION SET with a calendar: 3 to 12 Spaces, a 2 to 10 week window, one completion
// reward from the host. The member's line always counts what is left ("2 stops to go"), never a score.

import { slugify } from '@/lib/utils'

/** Hunt limits. The migration's check constraints hold the same numbers. */
export const HUNT_LIMITS = {
  stopsMin: 3,
  stopsMax: 12,
  daysMin: 14,
  daysMax: 70,
  titleMin: 3,
  titleMax: 80,
  descriptionMax: 500,
  rewardTitleMax: 80,
  noteMax: 280,
  valueMaxCents: 100_000,
} as const

/** Zaps for finishing a hunt (zap_config 'hunt_complete'; lib/zaps.ts fallback). */
export const HUNT_COMPLETE_ZAPS = 100

type HuntStatus = 'draft' | 'live' | 'ended'
type HuntStopStatus = 'invited' | 'accepted' | 'declined'

export interface HuntStop {
  spaceId: string
  spaceName: string
  spaceSlug: string
  status: HuntStopStatus
  /** The host's own stop. */
  host: boolean
}

export interface LoyaltyHunt {
  id: string
  slug: string
  hostSpaceId: string
  hostSpaceName: string
  title: string
  description: string | null
  startsOn: string
  endsOn: string
  rewardTitle: string
  rewardValueCents: number
  rewardNote: string | null
  status: HuntStatus
  stops: HuntStop[]
}

/** What the host submits to create or edit a hunt. */
export interface HuntInput {
  title: string
  description: string | null
  startsOn: string
  endsOn: string
  rewardTitle: string
  rewardValueCents: number
  rewardNote: string | null
}

/** A member's standing on one hunt, as the check-in result, the hunt page and /rewards print it. */
export interface HuntProgress {
  huntId: string
  slug: string
  title: string
  hostSpaceId: string
  stopsDone: number
  stopsTotal: number
  completed: boolean
  /** Set when the tap that just happened finished the hunt. */
  earnedCode: string | null
  rewardTitle: string
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function dayNumber(iso: string): number | null {
  if (!ISO_DAY.test(iso)) return null
  const t = Date.parse(`${iso}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null
}

/** Days from `from` to `to` (ISO dates), or null when either is not a date. Pure. */
export function daysBetween(from: string, to: string): number | null {
  const a = dayNumber(from)
  const b = dayNumber(to)
  return a === null || b === null ? null : b - a
}

/**
 * Validate the host's input. Returns the clean input, or the one sentence to show. The window must be
 * two to ten weeks; the reward needs a name. Pure.
 */
export function normalizeHuntInput(raw: unknown): { input: HuntInput } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, HUNT_LIMITS.titleMax) : ''
  const description = typeof r.description === 'string' ? r.description.trim().slice(0, HUNT_LIMITS.descriptionMax) : ''
  const startsOn = typeof r.startsOn === 'string' ? r.startsOn.trim() : ''
  const endsOn = typeof r.endsOn === 'string' ? r.endsOn.trim() : ''
  const rewardTitle = typeof r.rewardTitle === 'string' ? r.rewardTitle.trim().slice(0, HUNT_LIMITS.rewardTitleMax) : ''
  const note = typeof r.rewardNote === 'string' ? r.rewardNote.trim().slice(0, HUNT_LIMITS.noteMax) : ''
  const centsRaw = typeof r.rewardValueCents === 'number' ? r.rewardValueCents : Number(r.rewardValueCents ?? 0)
  const rewardValueCents = Number.isFinite(centsRaw) ? Math.min(HUNT_LIMITS.valueMaxCents, Math.max(0, Math.round(centsRaw))) : 0

  if (title.length < HUNT_LIMITS.titleMin) return { error: 'Give the hunt a name.' }
  const days = daysBetween(startsOn, endsOn)
  if (days === null) return { error: 'Pick a start day and an end day.' }
  if (days < HUNT_LIMITS.daysMin || days > HUNT_LIMITS.daysMax) return { error: 'A hunt runs two to ten weeks.' }
  if (!rewardTitle) return { error: 'Name the reward for finishing the hunt.' }
  return {
    input: {
      title,
      description: description || null,
      startsOn,
      endsOn,
      rewardTitle,
      rewardValueCents,
      rewardNote: note || null,
    },
  }
}

/** The slug a new hunt gets: its title plus a short tail, so two "Main Street Passport" hunts differ. Pure. */
export function huntSlug(title: string, tail: string): string {
  const base = slugify(title).slice(0, 60).replace(/-+$/, '') || 'hunt'
  const t = tail.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'x'
  return `${base}-${t}`
}

/** Why a draft cannot go live, or null when it can. Pure on the hunt. */
export function huntLiveBlocker(hunt: Pick<LoyaltyHunt, 'stops' | 'endsOn'>, today: string): string | null {
  const accepted = hunt.stops.filter((s) => s.status === 'accepted').length
  if (accepted < HUNT_LIMITS.stopsMin) return `A hunt needs ${HUNT_LIMITS.stopsMin} stops that said yes. ${accepted} so far.`
  const left = daysBetween(today, hunt.endsOn)
  if (left !== null && left < 0) return 'The end day has passed. Move it before going live.'
  return null
}

/** The one line a member sees under a hunt: "2 stops to go" or "You finished the hunt". Pure. */
export function huntLine(p: Pick<HuntProgress, 'stopsDone' | 'stopsTotal' | 'completed'>): string {
  if (p.completed) return 'You finished the hunt'
  const left = Math.max(1, p.stopsTotal - p.stopsDone)
  return left === 1 ? '1 stop to go' : `${left} stops to go`
}

/** A window as the page prints it ("Nov 1 to Dec 15"). Pure. */
export function huntWindow(startsOn: string, endsOn: string): string {
  const f = (iso: string) => {
    const t = Date.parse(`${iso}T12:00:00Z`)
    return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : iso
  }
  return `${f(startsOn)} to ${f(endsOn)}`
}

/** The RPC's jsonb reply (a list), narrowed. Anything malformed reads as no progress. Pure. */
export function readHuntReply(raw: unknown): HuntProgress[] {
  if (!Array.isArray(raw)) return []
  const out: HuntProgress[] = []
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>
    if (typeof r.hunt_id !== 'string' || typeof r.slug !== 'string') continue
    const total = typeof r.stops_total === 'number' ? r.stops_total : 0
    if (total <= 0) continue
    out.push({
      huntId: r.hunt_id,
      slug: r.slug,
      title: typeof r.title === 'string' ? r.title : 'Hunt',
      hostSpaceId: typeof r.host_space_id === 'string' ? r.host_space_id : '',
      stopsDone: typeof r.stops_done === 'number' ? Math.max(0, Math.min(total, r.stops_done)) : 0,
      stopsTotal: total,
      completed: r.completed === true,
      earnedCode: r.earned === true && typeof r.reward_code === 'string' ? r.reward_code : null,
      rewardTitle: typeof r.reward_title === 'string' ? r.reward_title : '',
    })
  }
  return out
}
