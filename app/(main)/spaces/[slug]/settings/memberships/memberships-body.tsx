import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { MembershipsSection } from './section'

// MEMBERSHIPS BODY (modular menu P2 · ADR-545) — the chrome-free Memberships manager as ONE self-gating
// body, rendered in TWO places from one source: the unified Offerings surface (which composes the SAME
// ./section.tsx) and INLINE as the Memberships `?panel=` workspace. Owns NO page chrome; SELF-GATES
// server-side exactly like members-body.tsx (null for a non-manager), then hands off to MembershipsSection,
// which re-checks its OWN per-Space `memberships` function gate. No duplication, no em dashes.

export async function MembershipsBody({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  return <MembershipsSection space={space} viewerProfileId={viewerProfileId} staffViewing={staffViewing} />
}
