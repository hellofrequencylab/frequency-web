import 'server-only'
import { getWalkthroughs, type Walkthrough, type WalkthroughCadence } from '@/lib/walkthroughs'

// Walkthroughs Phase B — selection + cadence runtime (server-only).
//
// Selection is PULL-BASED: at feed render we compute, from the member's own state
// (community_role, created_at, and their saved progress in profiles.meta.walkthroughs),
// which single walkthrough — if any — should show as a gentle in-feed card. No event
// plumbing: a member who just became a Host simply sees the Host card next load.
//
// Two gates, in order:
//   1. Trigger qualifies — does this member match WHO the walkthrough is for?
//   2. Cadence allows it — given their prior progress, should it show AGAIN now?
// Among everything qualifying + showable we return the highest `priority`, newest
// `createdAt` to break ties. Best-effort throughout (a bad row never breaks the feed).

const NEW_MEMBER_WINDOW_MS = 21 * 24 * 60 * 60 * 1000 // joined within 21 days
const SEASON_LAUNCH_WINDOW_MS = 21 * 24 * 60 * 60 * 1000 // season started within 21 days
const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

/** Per-walkthrough progress saved in profiles.meta.walkthroughs[slug] (ISO strings). */
export interface WalkthroughProgress {
  seenAt?: string
  dismissedAt?: string
  completedAt?: string
}

/** Parse the whole meta.walkthroughs sub-object, tolerating any shape. */
export function readProgressMap(meta: unknown): Record<string, WalkthroughProgress> {
  if (!meta || typeof meta !== 'object') return {}
  const wt = (meta as Record<string, unknown>).walkthroughs
  if (!wt || typeof wt !== 'object') return {}
  return wt as Record<string, WalkthroughProgress>
}

function parseTime(iso: string | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

function withinWindow(now: number, iso: string | undefined, windowMs: number): boolean {
  const t = parseTime(iso)
  return t !== null && now - t < windowMs
}

/** Everything selection needs to know about THIS member, computed once at feed render. */
export interface MemberContext {
  role: string
  createdAt: string | null
  meta: unknown
  /** True when the member holds an active stewardship edge on any circle. */
  leadsCircle: boolean
  /** starts_at of the current active season, or null when none / unknown. */
  seasonStartedAt: string | null
}

/**
 * Does the member qualify for this walkthrough's trigger right now?
 *   - manual              → everyone (the operator just flips it on).
 *   - new_member          → joined within the new-member window.
 *   - role_*              → their current community_role matches.
 *   - circle_lead         → they actively lead at least one circle.
 *   - season              → an active season launched within the season window.
 *   - project             → not wired (no project-launch concept on this model yet).
 */
export function triggerQualifies(wt: Walkthrough, ctx: MemberContext, now: number): boolean {
  switch (wt.trigger) {
    case 'manual':
      // The operator just turns it on — everyone qualifies.
      return true
    case 'new_member': {
      const joined = parseTime(ctx.createdAt ?? undefined)
      return joined !== null && now - joined <= NEW_MEMBER_WINDOW_MS
    }
    case 'role_host':
      return ctx.role === 'host'
    case 'role_guide':
      return ctx.role === 'guide'
    case 'role_mentor':
      return ctx.role === 'mentor'
    case 'circle_lead':
      return ctx.leadsCircle
    case 'season': {
      // Fire only while the season is freshly launched, so a long-running season doesn't
      // re-introduce its walkthrough to everyone for months.
      const launched = parseTime(ctx.seasonStartedAt ?? undefined)
      return launched !== null && now - launched <= SEASON_LAUNCH_WINDOW_MS
    }
    // No project-launch concept on this model yet — never qualifies.
    case 'project':
      return false
    default:
      return false
  }
}

/**
 * Pure cadence gate. Given a cadence, the member's saved progress, and `now` (ms),
 * should the card show? Unit-friendly — covered by runtime.test.ts.
 *   - completedAt set  → never (all cadences).
 *   - once             → only if never seen and never dismissed.
 *   - per_session      → unless dismissed or seen within the last 2h.
 *   - daily            → unless dismissed or seen within the last 24h.
 *   - until_done       → unless dismissed within the last 12h (returns until done).
 */
export function shouldShow(
  cadence: WalkthroughCadence,
  progress: WalkthroughProgress | undefined,
  now: number,
): boolean {
  const p = progress ?? {}
  if (p.completedAt) return false

  switch (cadence) {
    case 'once':
      return !p.seenAt && !p.dismissedAt
    case 'per_session':
      return !withinWindow(now, p.dismissedAt, TWO_HOURS_MS) && !withinWindow(now, p.seenAt, TWO_HOURS_MS)
    case 'daily':
      return !withinWindow(now, p.dismissedAt, TWENTY_FOUR_HOURS_MS) && !withinWindow(now, p.seenAt, TWENTY_FOUR_HOURS_MS)
    case 'until_done':
      return !withinWindow(now, p.dismissedAt, TWELVE_HOURS_MS)
    default:
      return false
  }
}

/** Is `now` inside the walkthrough's optional schedule window? */
function withinSchedule(wt: Walkthrough, now: number): boolean {
  const start = parseTime(wt.startsAt ?? undefined)
  if (start !== null && now < start) return false
  const end = parseTime(wt.endsAt ?? undefined)
  if (end !== null && now > end) return false
  return true
}

/**
 * Pick the one walkthrough to show this member right now, or null. Loads every
 * walkthrough, keeps the active + non-empty + in-window ones whose trigger qualifies
 * and whose cadence allows showing given the member's saved progress, then returns the
 * highest-priority (newest createdAt on ties). Best-effort.
 */
export async function selectWalkthroughForMember(ctx: MemberContext): Promise<Walkthrough | null> {
  const now = Date.now()
  const progressMap = readProgressMap(ctx.meta)

  let all: Walkthrough[]
  try {
    all = await getWalkthroughs()
  } catch {
    return null
  }

  const candidates = all.filter((wt) => {
    if (!wt.active) return false
    if (wt.steps.length === 0) return false
    if (!withinSchedule(wt, now)) return false
    if (!triggerQualifies(wt, ctx, now)) return false
    if (!shouldShow(wt.cadence, progressMap[wt.slug], now)) return false
    return true
  })

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    const at = parseTime(a.createdAt ?? undefined) ?? 0
    const bt = parseTime(b.createdAt ?? undefined) ?? 0
    return bt - at // newest first
  })

  return candidates[0]
}
