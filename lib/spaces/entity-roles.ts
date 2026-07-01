// The PROVISIONABLE entity-role set for the staff "preview as entity role" flow (item JAN-01,
// ADR-340). PURE + dependency-light (it imports only the provisionable-types helper, itself pure): no
// Supabase, no React, so it is safe to import from a CLIENT component (the view-as selector) as
// well as from the server action and the representative-Space reader.
//
// The list is sourced from the canonical provisionable-types helper (lib/spaces/profile-config.ts),
// never hardcoded, so it can never diverge from what the create wizard offers (ADR-339: the
// provisionable subset is the same list). Any new provisionable type grows this set with no edit
// here. `root` is not provisionable, so it is excluded by construction (never an entity a staffer
// previews as).

import { provisionableTypes, isProvisionableType } from './profile-config'
import type { SpaceType } from './types'

/** One previewable entity role: its `spaces.type` value and the operator-facing label (so the
 *  selector reads the same noun as the wizard and the type badge). */
export interface EntityRolePreview {
  type: SpaceType
  label: string
}

/** The entity roles a staffer may preview as: the provisionable subset, sourced from the SAME
 *  helper the create wizard uses, in the canonical role order, each carrying its operator-facing
 *  label. Excludes `root`; any new provisionable type appears here automatically, with no edit. */
export function previewableEntityRoles(): EntityRolePreview[] {
  return provisionableTypes().map((t) => ({ type: t.value, label: t.label }))
}

/** Is `v` a provisionable entity-role value? The downgrade-safe validator the cookie path and the
 *  resolver both gate on, so a forged or stale value never routes anywhere it shouldn't. `root` and
 *  any non-provisionable value fail this by construction. */
export function isPreviewableEntityRole(v: string | null | undefined): v is SpaceType {
  return isProvisionableType(v)
}
