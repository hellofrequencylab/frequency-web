import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { OfferingsBody } from './offerings-body'

// THE UNIFIED OFFERINGS SURFACE (the deeper Offerings merge). One adaptive, no-rail Focus surface that
// stacks the commerce sub-surfaces a Space configures here, instead of the separate settings sub-pages it
// replaces: Availability, Memberships, Donations. Every Space type composes all three (functions have been
// universal since ADR-517 Phase F); the empty state is the fail-safe for a type that resolves to none.
//
// It used to stack six. Enrollment, Tickets and Check in came off in LIVE-226: each was a second door onto
// a tool that already existed, so Offerings read as six products where there were three. Enrollment is a
// Journey plus the Memberships roster, tickets are the event ticket flow, and checking someone in is an
// event mechanic. Their function keys are retired in lib/spaces/functions.ts; their section bodies stay for
// the `?panel=` workspaces that still mount them.
//
// This IS the commerce home. The old individual routes (/settings/availability, /memberships,
// /donations, /tickets, /checkin) were deleted in ADR-552 Phase 4; every in-app link now points straight
// here anchored to its section (#<anchor>). The section + panel body components (section.tsx /
// *-body.tsx) still live in those folders.
// This page owns the ROUTE + AUTH gate ONCE (resolveSpaceManageAccess, notFound), then
// wraps the chrome-free <OfferingsBody> in the FocusTemplate. The same body ALSO renders inline in the
// Space profile as the Offerings `?panel=` workspace (Stage D2); it composes each section BODY (the
// extracted `*Section` components), which each re-check their OWN per-Space function gate and render the
// SAME forms whose server actions stay the source of truth.
//
// SECURITY: a Server Component, gated server-side. It resolves the Space, gates RENDER on canManage ||
// staffViewing, and notFound()s otherwise (no existence leak). Every mutation re-checks its OWN gate in
// its form's server action, so this render gate is UX and the actions stay the authority.

export const metadata = {
  title: 'Offerings',
}

export default async function SpaceOfferingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404 (not
  // 403) for everyone else so a non-manager cannot tell the surface exists. Every write stays gated in
  // its form's server action, so staff viewing is read-only end to end.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Offerings"
      description="Everything people can book, join, support, or attend. Open a section to set it up; it shows on your space page."
      width="wide"
    >
      <OfferingsBody slug={slug} />
    </FocusTemplate>
  )
}
