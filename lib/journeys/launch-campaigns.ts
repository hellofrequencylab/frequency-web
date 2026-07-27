// Journey LAUNCH campaign presets (ADR-840). The best-practice four-send series a publisher
// reviews on /journeys/[slug]/launch right after publishing:
//
//   Announce (publish day) → Enrollment open → Last call (window start minus ~2 days)
//   → Kickoff (window start)
//
// PURE + deterministic (no IO, no Supabase, `now` threaded) so the schedule derivation is
// unit-tested and the launch surface, the server actions, and any future notification path all
// read the same dates. Dates derive from the Journey's `window_starts_at` when it has a play
// window; a windowless Journey gets a sensible relative runway instead. The actual drafting and
// scheduling ride the EXISTING campaign machinery (lib/spaces/campaigns.ts) where the Journey
// belongs to a Space; nothing here sends anything.
//
// Copy passes the voice canon (docs/CONTENT-VOICE.md): plain sentences, a fact plus an
// invitation, no em dashes, nothing that narrates the reader's feelings. These are DRAFTS the
// publisher edits before anything goes out.

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** The four sends of the launch series, in send order. */
export const LAUNCH_CAMPAIGN_KEYS = ['announce', 'enrollment_open', 'last_call', 'kickoff'] as const
export type LaunchCampaignKey = (typeof LAUNCH_CAMPAIGN_KEYS)[number]

/** The derived send times, one per series key. All in the future relative to `now`. */
export type LaunchSchedule = Record<LaunchCampaignKey, Date>

/** One pre-drafted campaign the publisher reviews/edits/schedules on the launch surface. */
export interface LaunchCampaignDraft {
  key: LaunchCampaignKey
  /** Short operator-facing name for the series card. */
  name: string
  /** One line of "why this send exists" under the name. */
  purpose: string
  subject: string
  /** Plain text; blank lines become paragraphs at send (the campaign composer convention). */
  body: string
  /** The suggested send time (ISO). The publisher can change it before scheduling. */
  sendAt: string
}

// Relative defaults for a Journey with no play window: a two-week runway from publish to
// kickoff, which leaves room for the enrollment-open and last-call beats to breathe.
const DEFAULT_RUNWAY_DAYS = 14
const LAST_CALL_LEAD_DAYS = 2
const ENROLLMENT_OPEN_OFFSET_DAYS = 2
/** Minimum spacing between consecutive sends (and between `now` and the first send), so the
 *  series stays strictly ascending even against a window that is already at the door. */
const MIN_GAP_MS = HOUR_MS

/**
 * Derive the four send times. With a valid future-ish `windowStartsAt`: kickoff lands ON the
 * window start, last call ~2 days before it, enrollment open ~2 days after the announce.
 * Without one (or with a window already past): a 14-day relative runway from `now`.
 *
 * MONOTONE BY CONSTRUCTION: a final pass forces each send at least MIN_GAP_MS after the
 * previous one (and the announce at least MIN_GAP_MS after `now`), so a window starting in an
 * hour still yields a valid, strictly ascending, all-future series. A squeezed series can push
 * kickoff slightly past a very-near window start; the publisher adjusts on the surface.
 */
export function deriveLaunchSchedule(now: Date, windowStartsAt: string | null): LaunchSchedule {
  const base = now.getTime()

  const windowMs = windowStartsAt ? Date.parse(windowStartsAt) : NaN
  // A window in the past (or unparseable) cannot anchor a launch; fall back to the runway.
  const kickoffTarget =
    Number.isFinite(windowMs) && windowMs > base ? windowMs : base + DEFAULT_RUNWAY_DAYS * DAY_MS

  const candidates: Record<LaunchCampaignKey, number> = {
    announce: base + MIN_GAP_MS,
    enrollment_open: base + ENROLLMENT_OPEN_OFFSET_DAYS * DAY_MS,
    last_call: kickoffTarget - LAST_CALL_LEAD_DAYS * DAY_MS,
    kickoff: kickoffTarget,
  }

  // Enforce ascending order with the minimum gap, in series order.
  let prev = base
  const out = {} as LaunchSchedule
  for (const key of LAUNCH_CAMPAIGN_KEYS) {
    const at = Math.max(candidates[key], prev + MIN_GAP_MS)
    out[key] = new Date(at)
    prev = at
  }
  return out
}

/** What the drafts need to know about the Journey. */
export interface LaunchDraftInput {
  title: string
  /** Absolute URL of the Journey page (the caller resolves the app origin). */
  journeyUrl: string
  windowStartsAt: string | null
}

/**
 * The four pre-drafted campaigns for a Journey, dates from deriveLaunchSchedule. Copy is a
 * DRAFT in the platform voice; the publisher edits subject/body/time before scheduling.
 */
export function buildLaunchCampaignDrafts(input: LaunchDraftInput, now: Date = new Date()): LaunchCampaignDraft[] {
  const schedule = deriveLaunchSchedule(now, input.windowStartsAt)
  const title = input.title.trim() || 'your Journey'
  const url = input.journeyUrl

  const drafts: Record<LaunchCampaignKey, Omit<LaunchCampaignDraft, 'key' | 'sendAt'>> = {
    announce: {
      name: 'Announce',
      purpose: 'Tell your list the Journey exists, the day you publish.',
      subject: `New Journey: ${title}`,
      body: `${title} just went live on Frequency.\n\nIt is a guided Journey: a clear sequence of practices, one step at a time, with everything laid out for you.\n\nHave a look: ${url}`,
    },
    enrollment_open: {
      name: 'Enrollment open',
      purpose: 'Invite people to claim a spot once the announcement has landed.',
      subject: `Enrollment is open for ${title}`,
      body: `Enrollment for ${title} is open.\n\nJoining takes about a minute, and the first phase is ready the moment you enroll.\n\nSave your spot: ${url}`,
    },
    last_call: {
      name: 'Last call',
      purpose: 'A clear deadline nudge about two days before the start.',
      subject: `Two days until ${title} begins`,
      body: `${title} kicks off in two days.\n\nIf you have been meaning to join, this is the moment. Enroll now and you start with everyone else on day one.\n\nJoin here: ${url}`,
    },
    kickoff: {
      name: 'Kickoff',
      purpose: 'Get enrollees moving on day one.',
      subject: `${title} starts today`,
      body: `Today is day one of ${title}.\n\nOpen the first phase and do the first practice. Small steps, done daily, add up fast.\n\nStart here: ${url}`,
    },
  }

  return LAUNCH_CAMPAIGN_KEYS.map((key) => ({
    key,
    ...drafts[key],
    sendAt: schedule[key].toISOString(),
  }))
}
