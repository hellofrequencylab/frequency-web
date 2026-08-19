// OUTBOUND: the authorization seam for the approval spine.
//
// TWO gates, per the owner directive. Every surface that drafts or sends mail
// (Email Studio, the CRM member composer, per-Space marketing, the messaging
// composer) runs one of them:
//   • CONTENT WRITER (writerGate) — may DRAFT: create, edit, save, preview, and
//     test-send. A staff web_role (admin/janitor) OR a team role with the
//     'marketing' capability at write. This is the everyday operator.
//   • APPROVER (approverGate) — may ARM outbound (markReady/approve/schedule/
//     pause/cancel and the real send): ADMIN or JANITOR web_role ONLY. Approving
//     is the send-authorizing act, so it is deliberately narrower than the
//     marketing capability. Mirrors the isStaff(webRole) operator check the event
//     Layout editor uses.
//
// The split IS the governing rule in authorization form: nothing sends without
// approval, so drafting and approving can never be the same permission. A
// marketer without the staff web_role can prepare anything and arm nothing.
//
// Reads do NOT gate here — a read surface asserts its own requireAdmin (the Email
// Studio actions run requireAdmin('admin', { staff: 'marketing', staffLevel:
// 'read' })). Mutations self-gate through these helpers and return an ActionResult
// on denial. Server-only.

import { getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import { isStaff, type WebRole } from '@/lib/core/roles'
import { staffCan } from '@/lib/core/staff-roles'

export type GateResult =
  | { ok: true; profileId: string; webRole: WebRole }
  | { ok: false; error: string }

/**
 * The APPROVER gate: admin or janitor web_role only. This is the gate every
 * arming transition (markReady / approve / schedule / pause / cancel) and every
 * real send runs. A marketer WITHOUT the staff web_role can prepare drafts but
 * cannot approve.
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
 * write. Governs drafting: creating, editing, saving, previewing and test-sending
 * an email (none of which send anything to a list on their own).
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
