import { normalizeSpaceType } from '@/lib/spaces/types'

// The entity-Space TYPE label map for the directory + cards (ENTITY-SPACES-BUILD §A.4). One place
// turns a `spaces.type` value into the member-facing badge label, so every surface reads the same
// noun. Copy obeys NAMING + CONTENT-VOICE: plain proper nouns, title case, no jargon.
//
// The two public directory types (ADR-552, the business-model collapse): Business and Non Profit.
// Every former public type (practitioner / coaching / event space) is now a free FOCUS preset under
// Business (lib/spaces/modes.ts), so the member-facing chip reads only "Business" or "Non Profit".
// The hidden platform host (`root`) is never listed in the directory, so it falls back to a clean
// title-cased label.

// The types a member can FILTER the directory by, in display order. Drives both the filter control
// and the badge labels.
export const DIRECTORY_TYPES = [
  { value: 'business', label: 'Business' },
  { value: 'nonprofit', label: 'Non Profit' },
] as const

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DIRECTORY_TYPES.map((t) => [t.value, t.label]),
)

/** The member-facing label for a Space type. Runs the raw value through the legacy normalizer first
 *  (ADR-552), so an unmigrated row still holding a retired type (`practitioner`, `coaching`, ...) reads
 *  "Business" rather than title-casing the stale value. Belt-and-suspenders with the read-time
 *  normalizer at the Space mapper: the chip is correct even on a code path that passes a raw type. */
export function spaceTypeLabel(type: string): string {
  return TYPE_LABEL[normalizeSpaceType(type)] ?? 'Business'
}
