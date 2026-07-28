// Canonical event taxonomy + option lists for the in-place admin Settings module
// (components/admin/modules/event-settings-module.tsx) and its server-side validation
// (app/(main)/events/admin-actions.ts). Framework-free (no React, no server deps) so it
// imports cleanly into client components and 'use server' actions alike. The value spaces
// come from supabase/migrations/20260609230000_* + 20260625000000_event_geolocation —
// but note events.category has NO DB CHECK behind it (see the validation-sets note below).
// The create form, the /events index facets, and the discover hub catalog all read this
// module too (check:vocab keeps it that way — no surface hand-copies these lists).

export interface EventOption {
  value: string
  label: string
}

export type EventAttendanceMode = 'in_person' | 'online' | 'hybrid'

/** What the event *is* — friendly Title Case, no jargon. */
export const CATEGORY_OPTIONS: EventOption[] = [
  { value: 'gathering', label: 'Gathering' },
  { value: 'ceremony', label: 'Ceremony' },
  { value: 'movement', label: 'Movement' },
  { value: 'circle_ritual', label: 'Circle Ritual' },
  { value: 'learning', label: 'Learning' },
  { value: 'social', label: 'Social' },
  { value: 'service', label: 'Service' },
  { value: 'external_meetup', label: 'External Meetup' },
  { value: 'retreat', label: 'Retreat' },
  { value: 'online', label: 'Online' },
]

/** Who can see the event. Default `circle_only`: shared with your circle, nothing broadcast. */
export const VISIBILITY_OPTIONS: EventOption[] = [
  { value: 'circle_only', label: 'My circle' },
  { value: 'public', label: 'Anyone' },
  { value: 'unlisted', label: 'Anyone with the link' },
  { value: 'private', label: 'Invite only' },
]

/** How the gathering tends to land on the nervous system. Blank = unset (stored as null). */
export const ENERGY_OPTIONS: EventOption[] = [
  { value: '', label: 'Not sure yet' },
  { value: 'grounding', label: 'Grounding' },
  { value: 'high_activation', label: 'High activation' },
  { value: 'social', label: 'Social' },
  { value: 'ceremonial', label: 'Ceremonial' },
]

/** How people attend. in_person resolves to a map point from the address; online carries a
 *  link instead; hybrid carries both. */
export const ATTENDANCE_OPTIONS: { value: EventAttendanceMode; label: string }[] = [
  { value: 'in_person', label: 'In person' },
  { value: 'online', label: 'Online' },
  { value: 'hybrid', label: 'Both' },
]

// ── Validation sets ───────────────────────────────────────────────────────────────────────
// Use these to validate untrusted form input on the server before writing one of these
// columns. NOTE: events.category carries NO DB CHECK constraint (verified against prod,
// 2026-07-28 — 20260609230000 created it as plain `text default 'gathering'`), so for
// category this server-side validation is the ONLY gate; nothing downstream will 500 on an
// off-list value, it will simply be stored and then dropped by closed-set readers.

export const CATEGORY_VALUES: ReadonlySet<string> = new Set(CATEGORY_OPTIONS.map((o) => o.value))
export const VISIBILITY_VALUES: ReadonlySet<string> = new Set(VISIBILITY_OPTIONS.map((o) => o.value))
/** The non-empty energy tags the column accepts; '' maps to null (no tag). */
export const ENERGY_VALUES: ReadonlySet<string> = new Set(
  ENERGY_OPTIONS.map((o) => o.value).filter(Boolean),
)
export const ATTENDANCE_VALUES: ReadonlySet<string> = new Set(ATTENDANCE_OPTIONS.map((o) => o.value))

/** Normalize an untrusted energy value to a stored value: a valid tag, or null. */
export function coerceEnergyTag(raw: unknown): string | null {
  return typeof raw === 'string' && ENERGY_VALUES.has(raw) ? raw : null
}

/** Normalize an untrusted attendance value, defaulting to in_person (matches the rest of
 *  the events code). */
export function coerceAttendanceMode(raw: unknown): EventAttendanceMode {
  return typeof raw === 'string' && ATTENDANCE_VALUES.has(raw) ? (raw as EventAttendanceMode) : 'in_person'
}

/** ADR-883's visibility step-down rule, applied at every write seam (create, edit, /manage).
 *  `circle_only` only means something on a circle-scoped event — the RLS branch that reads it
 *  keys on scope_type='circle', so on any other scope the value strands the event with no
 *  audience its own setting can name. It steps down to `unlisted`, never `public`: the host
 *  asked for a narrow audience, and publishing an event they meant to keep close trades an
 *  invisible event for an over-broadcast one (the clearPlacementPatch rule, lib/events/placement). */
export function coerceVisibilityForScope(visibility: string, scopeType: string | null | undefined): string {
  return visibility === 'circle_only' && scopeType !== 'circle' ? 'unlisted' : visibility
}
