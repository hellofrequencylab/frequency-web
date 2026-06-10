// Single source of truth for the role AXES and their comparisons.
//
// TWO INDEPENDENT AXES (docs/NAMING.md §Roles, ADR-208):
//   1. community_role — the aspirational COMMUNITY TRUST ladder
//      (member < crew < host < guide < mentor). "host+" means host-or-above on
//      THIS axis only. This is who leads circles/hubs/nexuses.
//   2. web_role — the operational STAFF axis (none | admin | janitor; "Site
//      Admin" / "Executive Admin"). NOT a ladder you climb — it is who may enter
//      admin surfaces (admin/janitor) and the janitor-only crown jewels. It lives
//      on `profiles.web_role` (migration 20260613000050) and is read via the
//      WebRole helpers below. The `team_members` staff matrix (lib/core/staff-roles)
//      stays SIDE BY SIDE as the fine-grained per-domain layer.
//
// (Billing `membership_tier` is a third, orthogonal attribute — see entitlement.ts.)
//
// Framework-independent (no Next/Supabase imports) so the web app, the future
// mobile app, and server-side enforcement all share one definition. This is the
// canonical home for the `HIERARCHY` pattern that is currently duplicated across
// several server-action files — new code should import from here; existing
// duplicates can adopt it incrementally.

export type CommunityRole =
  | 'member'
  /** @deprecated The 'crew' ROLE value is retired (PB.1i, migration 20260612060000):
   *  paid standing lives on `profiles.membership_tier` (the 'crew' TIER), no code
   *  path writes the role value anymore, and existing rows were migrated to 'member'.
   *  The rung stays in the type + ladder because it mirrors the Postgres
   *  `community_role` enum (dropping a PG enum value is disruptive) — it is a
   *  no-op rung: no rows hold it and the access matrix skips it. */
  | 'crew'
  | 'host'
  | 'guide'
  | 'mentor'
  /** @deprecated for STAFF gating (migration 20260613000050 / ADR-208): the STAFF
   *  authority moved to `web_role` (see WebRole below). The 'admin'/'janitor' ENUM
   *  values are KEPT in the type + ladder for Postgres enum-order parity (dropping a
   *  PG enum value is disruptive; the remaining community `>= 'rung'` comparisons rely
   *  on order). No community code path should gate STAFF on these rungs anymore —
   *  use `isStaff(webRole)` / `isJanitor(webRole)`. */
  | 'admin'
  | 'janitor'

// Ascending privilege: member < crew < host < guide < mentor < admin < janitor.
// 'crew' is a DEPRECATED no-op rung (see above), kept only for enum-order parity
// with the DB; the paid "Crew" concept is the entitlement TIER (entitlement.ts).
// 'admin'/'janitor' are likewise DEPRECATED for STAFF gating (ADR-208) — the staff
// axis is `web_role` (WebRole below) — but the values stay for enum-order parity
// (the community `>= 'host'/'guide'/'mentor'` comparisons depend on declaration
// order). Staff gates read WebRole, not these rungs.
export const ROLE_HIERARCHY: readonly CommunityRole[] = [
  'member',
  'crew',
  'host',
  'guide',
  'mentor',
  'admin',
  'janitor',
] as const

// ─── The STAFF axis — web_role (docs/NAMING.md §Roles, ADR-208) ────────────────
//
// Independent of the community ladder. `none` = not staff; `admin` = Site Admin
// (admin surfaces, shares most operational keys); `janitor` = Executive Admin
// (the crown jewels — role assignment, member management, the permission grid,
// the financials carve-out). Mirrors `profiles.web_role`'s CHECK constraint.

export type WebRole = 'none' | 'admin' | 'janitor'

export const WEB_ROLES: readonly WebRole[] = ['none', 'admin', 'janitor'] as const

/** Narrowing guard for an untyped DB read (profiles.web_role). Anything outside
 *  the enum (incl. null/undefined) is treated as 'none' — fail-closed. */
export function asWebRole(v: string | null | undefined): WebRole {
  return v === 'admin' || v === 'janitor' ? v : 'none'
}

/** Platform STAFF = Site Admin or Executive Admin. The coarse "may enter admin
 *  surfaces / manage content I don't own" gate. */
export function isStaff(webRole: WebRole | null | undefined): boolean {
  return webRole === 'admin' || webRole === 'janitor'
}

/** Executive Admin only — the janitor-only crown jewels. */
export function isJanitor(webRole: WebRole | null | undefined): boolean {
  return webRole === 'janitor'
}

/** Numeric rank (0 = member … 5 = janitor); -1 for null/unknown. */
export function roleRank(role: CommunityRole | null | undefined): number {
  return role ? ROLE_HIERARCHY.indexOf(role) : -1
}

/** True when `role` is at least `min` on the ladder. */
export function atLeastRole(
  role: CommunityRole | null | undefined,
  min: CommunityRole,
): boolean {
  return roleRank(role) >= roleRank(min)
}
