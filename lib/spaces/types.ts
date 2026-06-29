// The Space domain model (ADR-249/SPACES.md, ADR-250 step 6). A Space is a white-label
// tenant of the one app/DB: its own type, brand/skin, domain, entity (money partition), a
// network-connected switch, and the set of registered verticals it turns on.

// The canonical role-type set (reconciled in ADR-339, see docs/SPACES.md). Every value a
// `spaces.type` row can hold lives here. PROVISIONABLE types (a member can stand one up in the
// create wizard) are the ones with a registered blueprint in lib/spaces/blueprints.ts: root,
// practitioner, business, organization, coaching, event_space. `lab` and `partner` are live
// platform/internal role values (an operator-gated CHECK and the §1 type facet, docs/SPACES.md)
// but their blueprints are intentionally DEFERRED to item ADMIN-05, so they are NOT yet
// provisionable through the wizard. They stay in the union so existing rows and the discovery /
// label paths type-check; do not remove them when adding the blueprints.
export type SpaceType =
  | 'root'
  | 'practitioner'
  | 'business'
  | 'organization'
  | 'coaching'
  | 'event_space'
  | 'lab'
  | 'partner'

export type SpaceStatus = 'active' | 'suspended' | 'archived'

export interface Space {
  id: string
  /** URL handle. */
  slug: string
  name: string
  type: SpaceType
  status: SpaceStatus
  /** The money partition this Space's commerce belongs to (entities.id). */
  entityId: string
  /** The [data-skin] token set applied to this Space's surfaces. */
  skin: string
  /** Custom domain / subdomain, or null when served under the root. */
  domain: string | null
  /** The switch (ADR-249 §3): on = ported into the shared network. */
  networkConnected: boolean
  /** Registered vertical ids ('market', …) this Space exposes (root exposes all). */
  enabledVerticals: string[]
  /** The operator who owns this Space (null for the root / platform spaces). */
  ownerProfileId: string | null
  /** Display brand name (falls back to `name` when null). Live: BrandMark renders it in the header. */
  brandName: string | null
  /** Same-origin or https URL of the Space's brand logo. Live: BrandMark renders it in the header. */
  brandLogoUrl: string | null
  /** Optional brand accent color (hex/rgb/hsl); the active palette still comes from `skin`. */
  brandAccent: string | null
  /** The capability map the Space's plan grants ({ "crm": true, … }). Carried loosely as `unknown`
   *  (ADR-246): the entitlement readers (lib/spaces/entitlements.ts) normalize the raw jsonb, so the
   *  Space type does not pin its shape. PROJECTING this fixes the latent CRM gate (it was never read
   *  onto the Space before, so spaceHasEntitlement(space,'crm') always saw undefined -> locked). */
  entitlements: unknown
  /** Per-function min-role overrides ({ "crm": "moderator", … }). Carried loosely as `unknown` (ADR-246,
   *  the column is not in the generated types yet); the function resolver (lib/spaces/functions.ts)
   *  normalizes it. Default '{}' = every function uses its code-default min-role. */
  featureRoles: unknown
  /** The Space billing plan label (spaces.plan: free/practitioner/business/organization/whitelabel,
   *  ADR-322). Projected for the live plan-ladder gate (lib/spaces/function-access.ts, ADR-370). Null
   *  defaults to 'free'. While billing is OFF the plan never gates anything (featureAllowed grants all). */
  plan?: string | null
}
