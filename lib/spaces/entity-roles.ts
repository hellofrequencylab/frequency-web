// The PROVISIONABLE entity-role set for the staff "preview as entity role" flow (item JAN-01,
// ADR-340). PURE + dependency-light (it imports only the blueprint registry, itself pure): no
// Supabase, no React, so it is safe to import from a CLIENT component (the view-as selector) as
// well as from the server action and the representative-Space reader.
//
// The list is sourced from the blueprint registry, never hardcoded, so it can never diverge from
// what the create wizard offers (ADR-339: the provisionable subset is exactly the types with a
// registered blueprint; `provisionableTypes()` is that very list the wizard renders). Any new role
// blueprint (Lab + Partner landed in ADMIN-05 / ADR-341) grows this set with no edit here, exactly
// as the wizard does. `root` has no blueprint, so it is excluded by construction (never an entity a
// staffer previews as).

import { blueprintForType, provisionableTypes } from './blueprints'
import type { SpaceType } from './types'

/** One previewable entity role: its `spaces.type` value and the operator-facing label from its
 *  blueprint (so the selector reads the same noun as the wizard and the type badge). */
export interface EntityRolePreview {
  type: SpaceType
  label: string
}

/** The entity roles a staffer may preview as: the provisionable subset, sourced from the SAME
 *  blueprint registry the create wizard uses, in the canonical role order, each carrying its
 *  blueprint's operator-facing typeLabel. Excludes `root` (no blueprint); any role added to the
 *  registry appears here automatically, with no edit. */
export function previewableEntityRoles(): EntityRolePreview[] {
  // provisionableTypes() returns { value, label } over exactly the blueprinted types. We cast value
  // to SpaceType: every provisionable type IS a member of the union (ADR-339), so this is sound.
  return provisionableTypes().map((t) => ({ type: t.value as SpaceType, label: t.label }))
}

/** Is `v` a provisionable entity-role value (a type with a registered blueprint)? The downgrade-safe
 *  validator the cookie path and the resolver both gate on, so a forged or stale value never routes
 *  anywhere it shouldn't. `root` and the not-yet-provisionable roles fail this by construction
 *  (no registered blueprint). */
export function isPreviewableEntityRole(v: string | null | undefined): v is SpaceType {
  return !!v && v !== 'root' && blueprintForType(v) !== null
}
