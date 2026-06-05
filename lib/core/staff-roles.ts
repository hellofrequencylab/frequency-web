// Single source of truth for the STAFF / operations axis (ADR-127). Separate from
// the community trust ladder (lib/core/roles.ts). Framework-independent (no
// Next/Supabase) so it's safe to import from client components, the server, and
// the future mobile app — like lib/core/roles.ts.
//
// The staff axis is NOT a pure ladder: Owner/Admin span everything, while
// Operations/Marketing/Accounting/Support are functional departments and Analyst
// is read-only. Access is therefore a role→domain CAPABILITY map, via `staffCan`.

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

const ALL_DOMAINS: readonly StaffDomain[] = [
  'community', 'structure', 'members', 'roles', 'marketing', 'profiles', 'finance', 'insights', 'platform', 'qr',
]

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

/** Does this staff role grant `domain` at `level` (default 'write')? null role = no. */
export function staffCan(
  role: StaffRole | null | undefined,
  domain: StaffDomain,
  level: Access = 'write',
): boolean {
  if (!role) return false
  const a = CAPS[role]?.[domain] ?? 'none'
  return level === 'read' ? a === 'read' || a === 'write' : a === 'write'
}

export function isStaffRole(v: string | null | undefined): v is StaffRole {
  return !!v && (STAFF_ROLES as readonly string[]).includes(v)
}

// The admin-surface domains. A staff role that can READ any of these may enter the
// /admin floor (then each group/page gates itself precisely).
const ADMIN_DOMAINS: readonly StaffDomain[] = ['community', 'structure', 'insights', 'qr']

/** True if the staff role can see at least one /admin group (read) — the /admin floor. */
export function staffSeesAdmin(role: StaffRole | null | undefined): boolean {
  return ADMIN_DOMAINS.some((d) => staffCan(role, d, 'read'))
}
