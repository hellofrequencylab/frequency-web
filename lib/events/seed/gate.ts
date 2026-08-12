// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT SEEDER — "may this caller seed events?", as a BOOLEAN (ADR-989 / ADR-997).
//
// `requireAdmin` is the gate everywhere the answer is "let them in or send them home". The
// flyer scan needs the other shape: /events/scan is a MEMBER page, so it has to ask the same
// question without redirecting anyone, purely to decide whether to offer the operator's batch
// door beside the member's own flow.
//
// The union is the console's, restated in one place rather than three: platform staff, or a
// community staff role that can write, with the owner-editable overrides layered on exactly as
// requireAdmin layers them (ADR-222). SERVER-ONLY. FAIL-CLOSED: any error is a `false`.
//
// This is a VISIBILITY check, never an authorization. Every staging write re-runs the real
// gate (requireAdmin) server-side, so a client that lies about seeing the button gets nothing.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { staffCan } from '@/lib/core/staff-roles'
import { getCapabilityOverrides } from '@/lib/permissions'
import { getStaffMember } from '@/lib/staff'

/** Whether the caller may stage events for review (the Event Seeder console's own union:
 *  `requireAdmin('admin', { staff: 'community', staffLevel: 'write' })`). */
export async function canSeedEvents(): Promise<boolean> {
  try {
    const profile = await getCallerProfile()
    if (!profile) return false
    if (isStaff(profile.webRole)) return true
    const staff = await getStaffMember().catch(() => null)
    if (!staff?.role) return false
    const overrides = await getCapabilityOverrides().catch(() => undefined)
    return staffCan(staff.role, 'community', 'write', overrides)
  } catch {
    return false
  }
}
