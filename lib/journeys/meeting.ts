// HOW A CIRCLE GATHERS AROUND A JOURNEY — the shape, and the coercion, with no imports (LIVE-009).
//
// WHY THIS FILE EXISTS. `normalizeJourneyMeeting` lived in `lib/journey-plans.ts`. That is a SERVER
// module: its first line is `createAdminClient` from lib/supabase/admin, and from there
// @supabase/supabase-js, lib/practices, lib/zaps, lib/achievements, lib/automations and a
// crypto-browserify polyfill graph. `components/journey/v2/journey-settings.tsx` is `'use client'`
// and imported this ONE pure function from it — so the whole server graph was in that page's browser
// bundle, and `import 'server-only'` could not be added to `lib/journey-plans.ts` without failing
// the build.
//
// Nothing in these functions was ever the problem. They take an `unknown` and return a bounded bag
// of strings; they have no imports and cannot acquire any. They were parked in a file whose other
// exports reach the database, and a bundler follows modules, not intentions.
//
// This is the same fix, for the same reason, as `lib/analytics/sanitize.ts` — read that file's
// header for what the five-hop version of this cost (~627 KB raw on 390 of 481 routes).
//
// ⚠️ KEEP THIS FILE DEPENDENCY-FREE. An import here re-opens the door it was written to close.
// `lib/journey-plans.ts` re-exports everything below, so every existing server caller is unchanged;
// CLIENT code must import from here.

/** One standing touchpoint a Circle gathers at (ADR-302/307): a Circle Meetup or a Weekend
 *  Gathering. All optional. */
export interface JourneyTouchpoint {
  format: 'virtual' | 'in_person' | 'hybrid' | null
  /** When it meets, free text (e.g. "Sundays 7pm"). */
  schedule: string | null
  /** Timezone label for the schedule (e.g. "ET"). */
  timezone: string | null
  /** Where it meets (a place, for in-person/hybrid). */
  location: string | null
  /** A join link (for virtual/hybrid). */
  link: string | null
  /** Anything else relevant. */
  notes: string | null
  /** A linked Event (events.id) this touchpoint gathers around — set from the "Create Event" flow. */
  eventId: string | null
}

/** How a Circle gathers around a Journey (ADR-307): the mid-week **Circle Meetup** (the flat
 *  fields, kept flat for back-compat with pre-touchpoint rows) plus an optional weekend
 *  **Weekend Gathering**. The group decides what each is for. */
export interface JourneyMeeting extends JourneyTouchpoint {
  /** The weekend social gathering. Null when unset. */
  gathering: JourneyTouchpoint | null
}

/** Coerce a raw value into a clean, bounded JourneyTouchpoint (defaults all-null). */
function normalizeTouchpoint(raw: unknown): JourneyTouchpoint {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown, max: number): string | null => {
    const t = typeof v === 'string' ? v.trim() : ''
    return t ? t.slice(0, max) : null
  }
  const fmt = typeof r.format === 'string' ? r.format : ''
  return {
    format: fmt === 'virtual' || fmt === 'in_person' || fmt === 'hybrid' ? fmt : null,
    schedule: str(r.schedule, 120),
    timezone: str(r.timezone, 40),
    location: str(r.location, 200),
    link: str(r.link, 500),
    notes: str(r.notes, 500),
    eventId: str(r.eventId, 64),
  }
}

/** True when nothing is filled in (so we store null instead of a blank Gathering object). */
export function touchpointIsEmpty(t: JourneyTouchpoint): boolean {
  return !t.format && !t.schedule && !t.timezone && !t.location && !t.link && !t.notes && !t.eventId
}

/** Coerce a raw `meeting` jsonb value into a clean, bounded JourneyMeeting (defaults all-null). One
 *  source of truth for both the settings editor (initial value) and the learn page (display). The
 *  flat fields are the Circle Meetup (back-compat); `gathering` is the optional Weekend Gathering. */
export function normalizeJourneyMeeting(raw: unknown): JourneyMeeting {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const meetup = normalizeTouchpoint(r)
  const gathering = normalizeTouchpoint(r.gathering)
  return { ...meetup, gathering: touchpointIsEmpty(gathering) ? null : gathering }
}
