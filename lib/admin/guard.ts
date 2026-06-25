// Shared admin page guard. Replaces the ~12 lines of identical auth + role
// boilerplate that every /admin/* page used to repeat: fetch the user, look up
// the profile, check the role. A viewer without access is REDIRECTED home —
// logged-out → '/' (marketing), insufficient role → '/feed' — never a 404 (a dead
// end the viewer can't recover from). One call, one source of truth, built on the
// request-cached getCallerProfile() (no extra round-trips).
//
//   export default async function Page() {
//     const { profileId, role } = await requireAdmin('janitor')
//     ...
//   }
//
// Pages still own their data fetching — this only gates entry and hands back the
// caller's profile id + effective role.

import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { atLeastRole, isStaff, isJanitor, type CommunityRole, type WebRole } from '@/lib/core/roles'
import { getStaffMember } from '@/lib/staff'
import { getCapabilityOverrides } from '@/lib/permissions'
import { staffCan, staffSeesAdmin, type StaffDomain, type StaffRole, type Access } from '@/lib/core/staff-roles'

export interface AdminContext {
  profileId: string
  role: CommunityRole
  /** The caller's STAFF web_role (ADR-208), independent of the community ladder. */
  webRole: WebRole
  /** The caller's staff/operations role (ADR-127), or null. */
  staffRole: StaffRole | null
}

/**
 * Does a `min` requirement (typed as CommunityRole for call-site compat) admit the
 * caller? TWO AXES (ADR-208): a `min` of 'admin'/'janitor' now means the STAFF axis
 * (web_role) — 'admin' admits admin+janitor, 'janitor' admits janitor only. Any
 * other rung ('host'/'guide'/'mentor'/'crew'/'member') is the COMMUNITY ladder, read
 * from community_role exactly as before.
 */
function meetsMin(min: CommunityRole, communityRole: CommunityRole, webRole: WebRole): boolean {
  if (min === 'janitor') return isJanitor(webRole)
  if (min === 'admin') return isStaff(webRole)
  return atLeastRole(communityRole, min)
}

/**
 * Require the caller to meet `min` (default 'host', the floor for /admin). With a
 * community rung (host/guide/mentor) this reads the trust ladder; with 'admin'/
 * 'janitor' it reads the STAFF axis (web_role, ADR-208). ADR-127: pass `opts.staff`
 * to ALSO admit a staff/operations role that holds that capability domain (write) —
 * an ADDITIVE, fail-closed union. With no `opts.staff` the gate is the primary axis
 * only (so sensitive pages that don't opt in — Roles, Members, AI, Platform — stay
 * staff-only). On denial the viewer is redirected home, not shown a 404.
 */
export async function requireAdmin(
  min: CommunityRole = 'host',
  opts?: { staff?: StaffDomain; staffLevel?: Access },
): Promise<AdminContext> {
  const profile = await getCallerProfile()
  if (!profile) redirect('/')
  const staff = await getStaffMember().catch(() => null)
  const staffRole = staff?.role ?? null
  const okPrimary = meetsMin(min, profile.community_role, profile.webRole)
  // ADR-222: layer the owner-editable capability overrides on the staff-axis check.
  const overrides = opts?.staff ? await getCapabilityOverrides() : undefined
  const okStaff = opts?.staff ? staffCan(staffRole, opts.staff, opts.staffLevel ?? 'write', overrides) : false
  if (!okPrimary && !okStaff) redirect('/feed')
  return { profileId: profile.id, role: profile.community_role, webRole: profile.webRole, staffRole }
}

/** The /admin entry floor: STAFF ONLY (owner: "only admin roles in admin") —
 *  platform staff (web_role admin/janitor) OR any team_members staff role that can
 *  see at least one admin group. The community ladder no longer opens /admin: a
 *  host/guide/mentor is a community leader, not a platform operator; their
 *  network-scoped admin is a separate future surface (docs/ROLES.md). getCallerProfile
 *  AND getStaffMember are both view-as aware, so a steward previewing a downgrade is
 *  faithfully blocked here. Each group/page still gates itself precisely below this. */
export async function requireAdminFloor(): Promise<AdminContext> {
  const profile = await getCallerProfile()
  if (!profile) redirect('/')
  const staff = await getStaffMember().catch(() => null)
  const staffRole = staff?.role ?? null
  const overrides = staffRole ? await getCapabilityOverrides() : undefined
  const okFloor =
    isStaff(profile.webRole) ||
    staffSeesAdmin(staffRole, overrides)
  if (!okFloor) redirect('/feed')
  return { profileId: profile.id, role: profile.community_role, webRole: profile.webRole, staffRole }
}

/** The /lead entry floor: COMMUNITY LEADERS only (host+ on the trust ladder —
 *  host/guide/mentor). This is the network-scoped leader surface that sits OUTSIDE
 *  /admin (which is now staff-only, requireAdminFloor above): a community leader is
 *  not a platform operator, so they get a consolidated dashboard of the circles they
 *  lead, NOT the admin workspace. The gate is the trust ladder only — staff standing
 *  does NOT open /lead (a staffer with no circles has nothing to lead here), and the
 *  /admin staff floor is never relaxed by this. getCallerProfile is view-as aware, so
 *  a steward previewing a downgrade below 'host' is faithfully redirected to /feed.
 *  Pages below this still scope every read to the caller's own circles. */
export async function requireLeadFloor(): Promise<AdminContext> {
  const profile = await getCallerProfile()
  if (!profile) redirect('/')
  const staff = await getStaffMember().catch(() => null)
  // Admit any community LEADER: host+ on the trust ladder, OR a staffer, OR — regardless of
  // rung — anyone who actually leads something (you can host a circle, guide a hub, or mentor a
  // nexus without holding the matching rung; that was the "Circles you host: 0" gap). The
  // dashboard's blocks each self-scope to the caller, so this only widens the door, never a read.
  let admit = atLeastRole(profile.community_role, 'host') || staff != null
  if (!admit) {
    const admin = createAdminClient()
    const [{ data: c }, { data: h }, { data: n }] = await Promise.all([
      admin.from('circles').select('id').eq('host_id', profile.id).limit(1),
      admin.from('hubs').select('id').eq('guide_id', profile.id).limit(1),
      admin.from('nexuses').select('id').eq('mentor_id', profile.id).limit(1),
    ])
    admit = Boolean(c?.length || h?.length || n?.length)
  }
  if (!admit) redirect('/feed')
  return {
    profileId: profile.id,
    role: profile.community_role,
    webRole: profile.webRole,
    staffRole: staff?.role ?? null,
  }
}

/**
 * Authorize a server ACTION (mutation): returns the (non-null) caller if `min` is
 * met — the COMMUNITY ladder for host/guide/mentor, or the STAFF axis (web_role,
 * ADR-208) for 'admin'/'janitor' mins — OR (ADR-127) the caller's team_members staff
 * role holds `staffDomain` (write); throws 'Unauthorized' otherwise. The action-level
 * twin of `requireAdmin`. Omit `staffDomain` to keep an action primary-axis only
 * (sensitive mutations).
 */
export async function authorizeAction<T extends { community_role: CommunityRole; webRole: WebRole }>(
  caller: T | null,
  min: CommunityRole,
  staffDomain?: StaffDomain,
): Promise<T> {
  if (caller) {
    if (meetsMin(min, caller.community_role, caller.webRole)) return caller
    if (staffDomain) {
      const staff = await getStaffMember().catch(() => null)
      const overrides = await getCapabilityOverrides().catch(() => undefined)
      if (staffCan(staff?.role ?? null, staffDomain, 'write', overrides)) return caller
    }
  }
  throw new Error('Unauthorized')
}
