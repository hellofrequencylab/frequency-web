// The entity-Space TYPE label map for the directory + cards (ENTITY-SPACES-BUILD §A.4). One place
// turns a `spaces.type` value into the member-facing badge label, so every surface reads the same
// noun. Copy obeys NAMING + CONTENT-VOICE: plain proper nouns, sentence/title case, no jargon.
//
// The five directory types (the entity Spaces a member browses): Practitioner, Business,
// Organization, Coaching, Event Space. `event_space` is a forward-looking value (its CHECK is owner-
// gated, ENTITY-SPACES-BUILD D-2) so it is matched as a plain string here — the moment the column
// allows it, the label is already correct. The platform/internal types (root / lab / partner) are
// never listed in the directory, so they fall back to a clean title-cased label.

// The types a member can FILTER the directory by, in display order. Drives both the filter control
// and the badge labels. `event_space` rides along ahead of its schema enabling (see above).
export const DIRECTORY_TYPES = [
  { value: 'practitioner', label: 'Practitioner' },
  { value: 'business', label: 'Business' },
  { value: 'organization', label: 'Organization' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'event_space', label: 'Event Space' },
] as const

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DIRECTORY_TYPES.map((t) => [t.value, t.label]),
)

/** The member-facing label for a Space type. An unknown/internal type title-cases its raw value
 *  (e.g. 'lab' -> 'Lab') so the badge is never blank. */
export function spaceTypeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
