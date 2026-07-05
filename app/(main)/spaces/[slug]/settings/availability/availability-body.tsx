import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { AvailabilitySection } from './section'

// BOOKING BODY (modular menu P2 · ADR-545) — the chrome-free Booking manager as ONE self-gating body, so
// it renders in TWO places from one source: (1) the unified Offerings surface (which composes the SAME
// ./section.tsx as one stacked section) and (2) INLINE in the Space profile body as the Booking `?panel=`
// workspace (components/spaces/workspace/space-body-panel.tsx). It owns NO page chrome (the panel header
// frames it) and SELF-GATES server-side, mirroring members-body.tsx exactly: it returns null when the
// viewer may not manage this Space (no bare 200), then hands the resolved space + preview flag to the
// existing AvailabilitySection, which re-checks its OWN per-Space `availability` function gate. Reuses the
// section body verbatim (no duplication); this wrapper only adds the standalone self-gate. No em dashes.

export async function BookingBody({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  // SELF-GATE on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). Render
  // nothing for everyone else; the section then re-checks the per-Space function gate.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  return <AvailabilitySection space={space} viewerProfileId={viewerProfileId} staffViewing={staffViewing} />
}
