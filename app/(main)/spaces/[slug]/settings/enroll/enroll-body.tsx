import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { EnrollSection } from './section'

// ENROLLMENT BODY (modular menu P2 · ADR-545) — the chrome-free Enrollment manager, rendered INLINE as the
// Enrollment `?panel=` workspace. It used to render in two places; Offerings dropped its copy when `enroll`
// was retired into `journeys` (LIVE-226), so this is now the only mount. Owns NO page chrome; SELF-GATES
// server-side exactly like members-body.tsx (null for a non-manager), then hands off to EnrollSection,
// which re-checks the gate (the retired `enroll` key resolves to the `journeys` switch + min-role). No em
// dashes.

export async function EnrollBody({ slug }: { slug: string }) {
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

  return <EnrollSection space={space} viewerProfileId={viewerProfileId} staffViewing={staffViewing} />
}
