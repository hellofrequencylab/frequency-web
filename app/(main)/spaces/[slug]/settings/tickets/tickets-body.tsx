import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { TicketsSection } from './section'

// TICKETS BODY (modular menu P2 · ADR-545) — the chrome-free Tickets manager, rendered INLINE as the
// Tickets `?panel=` workspace. It used to render in two places; Offerings dropped its copy when `tickets`
// was retired into `events` (LIVE-226), so this is now the only mount. Owns NO page chrome; SELF-GATES
// server-side exactly like members-body.tsx (null for a non-manager), then hands off to TicketsSection,
// which re-checks the gate (the retired `tickets` key resolves to the `events` switch + min-role). No em
// dashes.

export async function TicketsBody({ slug }: { slug: string }) {
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

  return <TicketsSection space={space} viewerProfileId={viewerProfileId} staffViewing={staffViewing} />
}
