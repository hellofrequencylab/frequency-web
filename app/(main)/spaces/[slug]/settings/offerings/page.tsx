import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { OfferingsBody } from './offerings-body'

// THE UNIFIED OFFERINGS SURFACE (the deeper Offerings merge). One adaptive, no-rail Focus surface that
// stacks whichever commerce sub-surfaces apply to THIS space's type, instead of the five separate
// type-gated settings sub-pages it replaces:
//   practitioner -> Availability
//   business     -> Memberships
//   organization -> Donations + Enrollment
//   event_space  -> Tickets + Check in
//   (lab / partner / coaching / root have no commerce section -> a tasteful empty state)
//
// The old individual routes (/settings/availability, /memberships, /donations, /enroll, /tickets,
// /checkin) still resolve: each redirects here anchored to its section (#<anchor>), so bookmarks and
// links never 404. This page owns the ROUTE + AUTH gate ONCE (resolveSpaceManageAccess, notFound), then
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
