// Canonical event taxonomy + option lists for the in-place admin Settings module
// (components/admin/modules/event-settings-module.tsx) and its server-side validation
// (app/(main)/events/admin-actions.ts). Framework-free (no React, no server deps) so it
// imports cleanly into client components and 'use server' actions alike. The value spaces
// mirror the events table CHECK constraints (supabase/migrations/20260609230000_* +
// 20260625000000_event_geolocation). The create/edit form (event-form.tsx) still inlines
// the same lists; this module is where the admin surface + validation share one definition
// (folding the form's copy in here is a clean follow-up).

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

// ── Validation sets (mirror the DB CHECK constraints) ────────────────────────────────────
// Use these to validate untrusted form input on the server before writing a constrained
// column (an unlisted value would otherwise 500 on the CHECK, or worse, write garbage).

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
