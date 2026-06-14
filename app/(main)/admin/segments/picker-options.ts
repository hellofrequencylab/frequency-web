// Picker option sources for the Segment Builder — the registry's tags + computed traits
// shaped for the composer's dropdowns. Server-only helper (reads the static registry); the
// composer is a Client Component and can't import the registry's server-side neighbours.

import { TAGS, COMPUTED_TRAITS } from '@/lib/traits/registry'
import type { TraitOption } from './segment-composer'

export function tagOptions(): TraitOption[] {
  return TAGS.map((t) => ({ key: t.key, label: t.label }))
}

export function traitOptions(): TraitOption[] {
  return COMPUTED_TRAITS.map((t) => ({ key: t.key, label: t.label, type: t.type, values: t.values }))
}
