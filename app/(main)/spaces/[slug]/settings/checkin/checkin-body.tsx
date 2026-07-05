import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { CheckinSection } from './section'

// CHECK-IN BODY (modular menu P2 · ADR-545) — the chrome-free Check-in manager as ONE self-gating body,
// rendered in TWO places from one source: the unified Offerings surface (composing the SAME ./section.tsx,
// which the Offerings page mounts only for an event_space) and INLINE as the Check-in `?panel=` workspace.
// Owns NO page chrome; SELF-GATES server-side exactly like members-body.tsx (null for a non-manager), then
// hands off to CheckinSection, which re-checks its OWN per-Space `checkin` function gate (moderator+ by
// default; a viewer without it gets the calm FeatureLockedNotice). No duplication, no em dashes.

export async function CheckinBody({ slug }: { slug: string }) {
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

  return <CheckinSection space={space} viewerProfileId={viewerProfileId} staffViewing={staffViewing} />
}
