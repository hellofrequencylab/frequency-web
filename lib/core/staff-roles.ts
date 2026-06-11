// Single source of truth for the STAFF / operations axis (ADR-127, ADR-223).
// Separate from the community trust ladder (lib/core/roles.ts). Framework-
// independent (no Next/Supabase) so it's safe to import from client components, the
// server, and the future mobile app — like lib/core/roles.ts.
//
// The staff axis is NOT a pure ladder: Owner/Admin span everything, while
// Operations/Marketing/Accounting/Support are functional departments and Analyst
// is read-only. Access is therefore a role→domain CAPABILITY map, via `staffCan`.
//
// SYSTEM 3 super-ladder (docs/ROLES.md §System 3, ADR-223): `team_members` is the
// single source for the staff axis. The two spanning tiers ARE the super-ladder —
// `owner` is the Executive Admin (the mega role: financials, role-granting, the
// permission grid — the ROLES.md "Janitor") and `admin` is the Site Admin (runs the
// platform, assigns roles below, but no financial WRITE — the ROLES.md "Admin").
// The community `community_role` admin/janitor rungs are deprecated for staff gating
// (ADR-208); the coarse `profiles.web_role` (none|admin|janitor) and this matrix sit
// side by side — web_role is the "is platform staff" floor, this matrix is the
// fine-grained per-domain layer. `isSuperStaff` below names the super-ladder tiers.

export type StaffRole =
  | 'owner'
  | 'admin'
  | 'operations'
  | 'marketer' // labelled "Marketing" — value kept for back-compat with ADR-027
  | 'accounting'
  | 'support'
  | 'analyst'

// Display order (most → least sweeping).
export const STAFF_ROLES: readonly StaffRole[] = [
  'owner', 'admin', 'operations', 'marketer', 'accounting', 'support', 'analyst',
] as const

// The System-3 SUPER-LADDER (ADR-223): the two spanning tiers that sit above the
// functional departments. `owner` = Executive Admin (ROLES.md "Janitor"), `admin` =
// Site Admin (ROLES.md "Admin"). These map to the coarse `web_role` axis (ADR-208):
// owner ⇒ web_role 'janitor', admin ⇒ web_role 'admin'.
export const SUPER_STAFF_ROLES: readonly StaffRole[] = ['owner', 'admin'] as const

/** True for the super-ladder tiers (Owner/Admin) — the spanning staff roles that
 *  sit above the functional departments. */
export function isSuperStaff(role: StaffRole | null | undefined): boolean {
  return !!role && (SUPER_STAFF_ROLES as readonly string[]).includes(role)
}

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  operations: 'Operations',
  marketer: 'Marketing',
  accounting: 'Accounting',
  support: 'Support',
  analyst: 'Analyst',
}

export const STAFF_ROLE_BLURB: Record<StaffRole, string> = {
  owner: 'Everything, incl. billing ownership & granting roles.',
  admin: 'All operations + assigns roles below Owner.',
  operations: 'Circles, channels, events, structure, members, moderation, QR.',
  marketer: 'Marketing, CRM, outreach, segments, growth intel.',
  accounting: 'Billing, subscriptions, payouts & reports. Members read-only.',
  support: 'Moderation, member assist, help gaps.',
  analyst: 'Read-only across insights & analytics.',
}

// Capability domains — the areas access is granted over.
export type StaffDomain =
  | 'community' | 'structure' | 'members' | 'roles'
  | 'marketing' | 'profiles' | 'finance' | 'insights' | 'platform' | 'qr'

export type Access = 'none' | 'read' | 'write'

export const STAFF_DOMAINS: readonly StaffDomain[] = [
  'community', 'structure', 'members', 'roles', 'marketing', 'profiles', 'finance', 'insights', 'platform', 'qr',
]

// Back-compat internal alias.
const ALL_DOMAINS = STAFF_DOMAINS

// Access levels, least → most open. Used by the per-function permission grid editor.
export const ACCESS_LEVELS: readonly Access[] = ['none', 'read', 'write']

export const STAFF_DOMAIN_LABEL: Record<StaffDomain, string> = {
  community: 'Community',
  structure: 'Structure',
  members: 'Members',
  roles: 'Roles',
  marketing: 'Marketing',
  profiles: 'Profiles',
  finance: 'Finance',
  insights: 'Insights',
  platform: 'Platform',
  qr: 'QR',
}

// Role → domain → access. Absent = none. (The approved ADR-127 matrix.)
const CAPS: Record<StaffRole, Partial<Record<StaffDomain, Access>>> = {
  owner: Object.fromEntries(ALL_DOMAINS.map((d) => [d, 'write'])) as Record<StaffDomain, Access>,
  admin: {
    community: 'write', structure: 'write', members: 'write', roles: 'write',
    marketing: 'write', profiles: 'write', finance: 'read', insights: 'write', platform: 'write', qr: 'write',
  },
  operations: {
    community: 'write', structure: 'write', members: 'write', profiles: 'write', qr: 'write',
    insights: 'read', platform: 'read',
  },
  marketer: { marketing: 'write', profiles: 'write', qr: 'write', members: 'read', insights: 'read' },
  accounting: { finance: 'write', members: 'read', insights: 'read' },
  support: { community: 'write', members: 'write', profiles: 'write', insights: 'read' },
  analyst: { community: 'read', structure: 'read', members: 'read', marketing: 'read', insights: 'read', qr: 'read' },
}

// ── Per-FUNCTION (capability) permission overrides — P1.7, ADR-222 ───────────────
//
// The owner-editable matrix grants/denies at the granularity of a (role × domain)
// CELL of `CAPS` — a FUNCTION, not a whole route. Overrides persist in the
// `capability_permissions` table (read by lib/permissions.ts) and are LAYERED on top
// of `CAPS` here, with precedence:
//
//     override (capability_permissions)  >  default (CAPS)
//
// BEHAVIOR-PRESERVING: an empty / absent override map resolves EXACTLY as `CAPS`
// (today). Only a present `(role, domain)` row changes the cell. This is purely
// additive and orthogonal to the route-level `area_permissions` grid (which stays
// authoritative for nav visibility).

/** A sparse override map: role → domain → Access. Absent cell ⇒ fall back to CAPS. */
export type CapabilityOverrides = Partial<Record<StaffRole, Partial<Record<StaffDomain, Access>>>>

/** The CODE-DEFAULT access for a (role, domain) — the ADR-127 `CAPS` matrix. */
export function staffDomainDefault(role: StaffRole, domain: StaffDomain): Access {
  return CAPS[role]?.[domain] ?? 'none'
}

/**
 * The EFFECTIVE access a staff role has on a domain, resolving the override layer:
 * an explicit `(role, domain)` override wins; otherwise the `CAPS` default. Pure and
 * deterministic. With no overrides this equals `staffDomainDefault` — i.e. today.
 */
export function resolveStaffAccess(
  role: StaffRole | null | undefined,
  domain: StaffDomain,
  overrides?: CapabilityOverrides,
): Access {
  if (!role) return 'none'
  const ov = overrides?.[role]?.[domain]
  return ov ?? staffDomainDefault(role, domain)
}

/**
 * Does this staff role grant `domain` at `level` (default 'write')? null role = no.
 * `overrides` (the owner-editable capability grid, ADR-222) is layered on top of the
 * code default; omitted ⇒ pure `CAPS` behavior (unchanged).
 */
export function staffCan(
  role: StaffRole | null | undefined,
  domain: StaffDomain,
  level: Access = 'write',
  overrides?: CapabilityOverrides,
): boolean {
  if (!role) return false
  const a = resolveStaffAccess(role, domain, overrides)
  return level === 'read' ? a === 'read' || a === 'write' : a === 'write'
}

export function isStaffRole(v: string | null | undefined): v is StaffRole {
  return !!v && (STAFF_ROLES as readonly string[]).includes(v)
}

// The admin-surface domains. A staff role that can READ any of these may enter the
// /admin floor (then each group/page gates itself precisely).
const ADMIN_DOMAINS: readonly StaffDomain[] = ['community', 'structure', 'insights', 'qr']

/** True if the staff role can see at least one /admin group (read) — the /admin floor. */
export function staffSeesAdmin(
  role: StaffRole | null | undefined,
  overrides?: CapabilityOverrides,
): boolean {
  return ADMIN_DOMAINS.some((d) => staffCan(role, d, 'read', overrides))
}
