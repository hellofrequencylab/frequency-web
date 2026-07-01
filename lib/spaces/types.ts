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

// The Space types the unified owner CONSOLE (/spaces/<slug>/manage) serves (ADR-441 EM1-3, completed
// in EM2-3 "all Space profiles"). The console notFound()s for every other type, so they stay on the
// legacy /settings hub. Every PROVISIONABLE type is now served, including `coaching` (brought onto the
// console with Space Modes M3, ADR-461/464; it previously fell back to the legacy /settings hub);
// `root` is the never-provisioned platform host. Keep this list in lockstep with the type gate in
// app/(main)/spaces/[slug]/manage/page.tsx (the page imports `isConsoleSpaceType`).
const CONSOLE_SPACE_TYPES: readonly SpaceType[] = [
  'practitioner',
  'organization',
  'business',
  'coaching',
  'event_space',
  'lab',
  'partner',
]

/** Does the unified `/manage` console serve this Space type? The one predicate the manage page and
 *  `spaceManageHref` both read, so the route gate and the "Manage" affordance never drift. */
export function isConsoleSpaceType(type: SpaceType): boolean {
  return CONSOLE_SPACE_TYPES.includes(type)
}

/** The owner-management entry point for a Space, by type (ADR-441 EM1-3 / EM2-3). The unified
 *  `/manage` console serves every provisionable type (coaching joined with Space Modes M3); only
 *  `root` opens the legacy `/settings` hub. PURE (a type + slug in, a path out), so it is the one
 *  place the harmonization rule lives for every "Manage" affordance. The legacy hub redirects the
 *  console types to /manage anyway, so this just avoids the bounce. */
export function spaceManageHref(type: SpaceType, slug: string): string {
  const base = `/spaces/${slug}`
  return isConsoleSpaceType(type) ? `${base}/manage` : `${base}/settings`
}

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
  /** The operator-uploaded landing banner (spaces.cover_image_url, 20260918000000). Null means no
   *  stored cover (the SpaceIdentityHeader block falls back to a neutral placeholder). Read untyped
   *  (ADR-246) until lib/database.types.ts regenerates. */
  coverImageUrl?: string | null
  /** The one-line Space tagline (spaces.tagline), shown under the name in the identity header. Read
   *  untyped (ADR-246). Null / absent renders no subtitle. */
  tagline?: string | null
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
  /** The Focus sub-mode (spaces.mode_variant, Space Modes M2, ADR-461/464). Null resolves to the
   *  type's DEFAULT Focus in lib/spaces/modes.ts resolveMode. FRAMING only, never a gate. Read untyped
   *  (ADR-246) until lib/database.types.ts regenerates. */
  modeVariant?: string | null
  /** Operator OVERRIDES of the Mode preset (spaces.preferences jsonb, Space Modes M2). Nav order, label
   *  overrides, and toggle overrides merged OVER the Mode defaults so operator override wins. Carried
   *  loosely as `unknown` (ADR-246); the Mode reader normalizes it. Default '{}' = no overrides =
   *  the pure Mode defaults. FRAMING only, never a gate. */
  preferences?: unknown
}
