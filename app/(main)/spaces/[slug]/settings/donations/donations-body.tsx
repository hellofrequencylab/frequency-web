import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { DonationsSection } from './section'

// DONATIONS BODY (modular menu P2 · ADR-545) — the chrome-free Donations manager as ONE self-gating body,
// rendered in TWO places from one source: the unified Offerings surface (composing the SAME ./section.tsx)
// and INLINE as the Donations `?panel=` workspace. Owns NO page chrome; SELF-GATES server-side exactly like
// members-body.tsx (null for a non-manager), then hands off to DonationsSection, which re-checks its OWN
// per-Space `donations` function gate. No duplication, no em dashes.

export async function DonationsBody({ slug }: { slug: string }) {
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

  return <DonationsSection space={space} viewerProfileId={viewerProfileId} staffViewing={staffViewing} />
}
