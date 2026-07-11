// Beta Command Center: the authorization seam for the approval spine.
//
// TWO gates, per the owner directive:
//   • CONTENT WRITER (writerGate) — may draft/edit phase content, tasks, and
//     propose waves: a staff web_role (admin/janitor) OR a team role with the
//     'marketing' capability at write. This is the everyday operator.
//   • APPROVER (approverGate) — may ARM outbound (markReady/approve/pause/cancel/
//     armPhase): ADMIN or JANITOR web_role ONLY. Approving is the send-authorizing
//     act, so it is deliberately narrower than the marketing capability. Mirrors
//     the isStaff(webRole) operator check the event Layout editor uses.
//
// Reads do NOT gate here (the /admin/beta layout re-asserts staffCan marketing;
// the read functions in lib/beta/* are called only below that gate) — matching
// lib/studio/beta.ts. Mutations self-gate through these helpers and return an
// ActionResult on denial. Server-only.

import { getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import { isStaff, type WebRole } from '@/lib/core/roles'
import { staffCan } from '@/lib/core/staff-roles'

export type GateResult =
  | { ok: true; profileId: string; webRole: WebRole }
  | { ok: false; error: string }

/**
 * The APPROVER gate: admin or janitor web_role only. This is the gate every
 * arming transition (markReady / approve / pause / cancel / armPhase) runs. A
 * marketer WITHOUT the staff web_role can prepare drafts but cannot approve.
 */
export async function approverGate(): Promise<GateResult> {
  const profile = await getCallerProfile()
  if (!profile) return { ok: false, error: 'Sign in required.' }
  if (!isStaff(profile.webRole)) {
    return { ok: false, error: 'Only an admin or executive admin can approve outbound.' }
  }
  return { ok: true, profileId: profile.id, webRole: profile.webRole }
}

/**
 * The CONTENT WRITER gate: a staff web_role OR the 'marketing' capability at
 * write. Governs drafting/editing phase content, tasks, and proposing waves
 * (none of which send anything on their own).
 */
export async function writerGate(): Promise<GateResult> {
  const profile = await getCallerProfile()
  if (!profile) return { ok: false, error: 'Sign in required.' }
  if (isStaff(profile.webRole)) return { ok: true, profileId: profile.id, webRole: profile.webRole }
  const staff = await getStaffMember().catch(() => null)
  if (staff && staffCan(staff.role, 'marketing', 'write')) {
    return { ok: true, profileId: profile.id, webRole: profile.webRole }
  }
  return { ok: false, error: 'Marketer access required.' }
}
