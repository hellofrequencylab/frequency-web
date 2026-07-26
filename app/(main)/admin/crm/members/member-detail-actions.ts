'use server'

import { requireAdmin } from '@/lib/admin/guard'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { listActiveSpaceMemberIds, isContactRowId, contactIdFromRowId } from '@/lib/spaces/resonance-roster'
import { buildMemberDetail, buildSpaceContactDetail } from '@/lib/crm/member-detail'
import type { CrmMemberDetail } from '@/components/people/member-viewer'

// The THIN gated wrappers over the shared CrmMemberDetail builder (CRM Everywhere plan 1.1). The
// assembly itself lives in lib/crm/member-detail.ts so every surface (platform CRM, space Resonance,
// the event/circle/hub/nexus leader panes) composes ONE builder; this file owns only the platform +
// space GATES and TENANCY checks, exactly as before the extraction. Behavior is unchanged: same
// action names, same gates, same detail shape.

/**
 * Assemble the CrmMemberDetail for a profile id — everything the cockpit's master-detail pane shows on
 * ONE page, in a SINGLE fetch: identity + all contact info + roles, the shared scores, the engagement
 * rollup, what they manage + are part of (the network), the MAJOR-milestone Path, and steward notes.
 * Staff-gated; reads only existing sources; never throws (returns a minimal identity detail on any
 * failure). Omits any field it cannot source cleanly, so the pane renders only what is real.
 */
export async function loadMemberDetail(profileId: string): Promise<CrmMemberDetail> {
  await requireAdmin('janitor')
  return buildMemberDetail(profileId)
}

/**
 * Space-manager path (ADR-787): a space owner / admin (or a staff previewer) loads a member's rich detail
 * INLINE in the space Resonance roster, gated on space-manage AND a TENANCY check — the member must be in
 * THIS space's reachable roster, so a manager can never read an arbitrary platform member by guessing an id.
 * Reuses the SAME builder as the admin loader, so the space + admin Resonance CRM read identically. `slug`
 * is bound server-side by the roster, so the client only passes the profile id.
 */
export async function loadSpaceMemberDetail(slug: string, profileId: string): Promise<CrmMemberDetail> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) throw new Error('Space not found')
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) throw new Error('Not authorized')
  // TENANCY: only an ACTIVE member of THIS space (space_members + owner) may be opened here — the same set
  // the roster lists, so any real member opens (scored or not) and no arbitrary platform member can.
  const memberIds = await listActiveSpaceMemberIds(space.id)
  if (!memberIds.includes(profileId)) throw new Error('Not in this space')
  // Pass the space id so the engagement rollup (Sent/Opened/Clicked/Replied) reflects THIS space's own
  // emails to the member, never the platform CRM (no crossover).
  return buildMemberDetail(profileId, { spaceId: space.id })
}

/**
 * The space Resonance master-detail's ONE detail loader (ADR-789): dispatches by row id. A `contact:<uuid>`
 * id resolves the space CONTACT (lead) detail; any other id is a member profile id and takes the member
 * path above. So the SAME MemberViewer renders both members and contacts inline. `slug` is bound by the
 * roster; the client only passes the row id. Space-manage gated; FAIL-SAFE.
 */
export async function loadSpaceResonanceDetail(slug: string, id: string): Promise<CrmMemberDetail> {
  if (!isContactRowId(id)) return loadSpaceMemberDetail(slug, id)
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) throw new Error('Space not found')
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) throw new Error('Not authorized')
  return buildSpaceContactDetail(space.id, contactIdFromRowId(id))
}
