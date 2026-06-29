// Safe-field editing for a CRM `contacts` row (ADR-379). Staff can edit a small set
// of SAFE fields on a contact; everything else is off-limits. Email is the identity
// stitch key (ADR-130) and is deliberately NOT editable here.
//
// This module is the PURE patch builder — no DB, no auth. It takes raw form input,
// allowlists it down to the editable fields, normalizes each value, and returns the
// exact column patch to write. The server action (app/.../contacts/actions.ts) owns
// the auth gate and the write; keeping the allowlist pure makes it unit-testable and
// means arbitrary input can never be spread into the DB.
//
// One wrinkle: `contacts` has no `city` column. The row carries a structured `meta`
// jsonb (already home to `acquisition`), so `city` lives at `meta.city`. The builder
// returns the column patch AND the city value separately, so the action can merge the
// existing `meta` object instead of clobbering it.

/** The fields a staff member may edit on a contact. Email is excluded on purpose. */
export const CONTACT_EDITABLE_FIELDS = ['display_name', 'city', 'source'] as const
export type ContactEditableField = (typeof CONTACT_EDITABLE_FIELDS)[number]

/** Raw, untrusted input from the edit form (every field optional). */
export type ContactFieldInput = Partial<Record<ContactEditableField, string | null>>

/** A column patch for the typed `contacts` columns (never includes `city`/`meta`). */
type ContactColumnPatch = {
  display_name?: string | null
  source?: string | null
}

/** The result: a typed column patch, plus the `meta.city` value when `city` was given. */
export type ContactPatch = {
  /** Direct column writes (display_name, source). Empty when nothing column-y changed. */
  columns: ContactColumnPatch
  /** True only when the form actually submitted `city` (so we never blank an untouched field). */
  cityProvided: boolean
  /** The normalized city to store at `meta.city`. `null` clears it. */
  city: string | null
}

/** Max length for any editable contact free-text field (SEC-7) — prevents unbounded writes. */
const MAX_CONTACT_FIELD = 200

/** Trim a value; an empty (or whitespace-only) string becomes `null` (clears the field). Caps
 *  the length so a staff edit can never write an unbounded string to the row. */
function normalize(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed.slice(0, MAX_CONTACT_FIELD)
}

/**
 * Build a safe contact patch from raw form input. Only the allowlisted fields are
 * read; any other key on `input` is ignored. A field is only included in the patch
 * when the caller actually supplied it (so a partial form never blanks fields it
 * didn't touch). Values are trimmed; empty strings clear the field to `null`.
 */
export function buildContactPatch(input: ContactFieldInput): ContactPatch {
  const columns: ContactColumnPatch = {}

  if ('display_name' in input) columns.display_name = normalize(input.display_name)
  if ('source' in input) columns.source = normalize(input.source)

  const cityProvided = 'city' in input
  const city = cityProvided ? normalize(input.city) : null

  return { columns, cityProvided, city }
}

/** True when a patch would write nothing (no column changes and no city change). */
export function isEmptyContactPatch(patch: ContactPatch): boolean {
  return Object.keys(patch.columns).length === 0 && !patch.cityProvided
}

/** Read `city` back out of a contact's `meta` jsonb (where the editor stores it). */
export function cityFromMeta(meta: unknown): string | null {
  const m = meta as Record<string, unknown> | null
  const city = m?.city
  return typeof city === 'string' && city.trim().length > 0 ? city : null
}
