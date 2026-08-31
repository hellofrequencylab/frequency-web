// THE BOOKING WINDOW — when a host will accept an RSVP at all.
//
// A host sets "RSVPs open at" / "RSVPs close at" in event settings. Until now those two fields
// were WRITTEN (app/(main)/events/admin-actions.ts) and DISPLAYED (components/widgets/events/
// event-when-where.tsx) and enforced by absolutely nothing: a host who closed RSVPs a week before
// the door kept taking RSVPs right up to the start, and the page went on telling readers the
// opposite. A control that publishes a promise it does not keep is worse than no control, because
// the host stops watching the thing they think it is handling (ADR-1174).
//
// This module is the one place that decides. It is PURE and TOTAL — no React, no Supabase, no
// clock of its own unless you leave `now` off — so the same rule runs in the server actions, in
// the page's render, and in the tests, and the three cannot drift.
//
// STORAGE: `events.details.rsvpWindow` = `{ opensAt, closesAt }`, a jsonb bag with no dedicated
// column (the same read-merge-write shape the poster-harvest keys use). Either side may be absent;
// both absent means no window, which is what nearly every event has and must keep meaning "open".
//
// TIME: the two values are stored the way `events.starts_at` is — the event's WALL CLOCK carried
// in UTC parts (lib/time/zone.ts) — because they come from the same `datetime-local` control the
// start and end times do. So they are resolved through `eventInstant` in the EVENT's zone before
// being compared to now. Comparing the raw string to `new Date()` is the exact bug ADR-1150 fixed
// on the guest door, seven hours early in PDT; it is not repeated here.
//
// FAILS OPEN. A malformed bag, an unparseable date, a window whose sides are backwards: every one
// of them yields 'open'. Refusing an RSVP is the expensive direction — the guest is standing at a
// door that will not let them say they are coming, and no error reaches the host.

import { eventInstant } from '@/lib/time/zone'

export interface RsvpWindow {
  /** Stored wall clock (UTC parts) for the moment RSVPs open, or null for "already open". */
  opensAt: string | null
  /** Stored wall clock (UTC parts) for the moment RSVPs close, or null for "never closes". */
  closesAt: string | null
}

/** No window at all — the shape every event without the key resolves to. */
export const NO_RSVP_WINDOW: RsvpWindow = { opensAt: null, closesAt: null }

/**
 * The gate's answer.
 *   'open'    — take the RSVP.
 *   'pending' — the window has not opened yet.
 *   'closed'  — the window has passed.
 */
export type RsvpWindowState = 'open' | 'pending' | 'closed'

/** Read the window off an `events.details` bag. Anything unexpected reads as no window. */
export function readRsvpWindow(details: unknown): RsvpWindow {
  const w = details && typeof details === 'object' ? (details as Record<string, unknown>).rsvpWindow : null
  if (!w || typeof w !== 'object') return NO_RSVP_WINDOW
  const o = w as Record<string, unknown>
  return {
    opensAt: typeof o.opensAt === 'string' && o.opensAt ? o.opensAt : null,
    closesAt: typeof o.closesAt === 'string' && o.closesAt ? o.closesAt : null,
  }
}

/**
 * Where we are in the window right now. `zone` is the EVENT's zone (`events.time_zone`); the
 * stored values are wall clock, so the zone is what turns them into instants.
 *
 * A backwards window (closes before it opens) is treated as no window rather than as a door that
 * can never be walked through — a host who fat-fingers two dates should not silently lose every
 * RSVP, and there is no way to tell them from here.
 */
export function rsvpWindowState(
  window: RsvpWindow,
  zone: string | null | undefined,
  now: Date = new Date(),
): RsvpWindowState {
  const opens = eventInstant(window.opensAt, zone)
  const closes = eventInstant(window.closesAt, zone)
  if (opens && closes && closes.getTime() <= opens.getTime()) return 'open'
  if (opens && now.getTime() < opens.getTime()) return 'pending'
  if (closes && now.getTime() >= closes.getTime()) return 'closed'
  return 'open'
}

/** Convenience: the whole question in one call, straight off a `details` bag. */
export function rsvpWindowStateFromDetails(
  details: unknown,
  zone: string | null | undefined,
  now: Date = new Date(),
): RsvpWindowState {
  return rsvpWindowState(readRsvpWindow(details), zone, now)
}

/**
 * The line a reader sees in place of the RSVP control. Plain, no em dashes, no narrating how they
 * feel about it (docs/CONTENT-VOICE.md). Returns null when the door is open and there is nothing
 * to say.
 */
export function rsvpWindowNote(state: RsvpWindowState): string | null {
  if (state === 'pending') return 'RSVPs for this one open a little later.'
  if (state === 'closed') return 'RSVPs for this one are closed.'
  return null
}
