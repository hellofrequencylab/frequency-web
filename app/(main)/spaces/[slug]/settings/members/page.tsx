import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { MembersBody } from './members-body'

// MEMBERS — the owner back-end's TEAM surface (entity-spaces owner hub). A centered, no-rail Focus
// surface (registered 'none' for /spaces/<slug>/settings/members in page-chrome.ts, alongside the
// other settings sub-surfaces). This page is the STANDALONE route (the "full admin" reachable from the
// console sub-menu + a deep link); the same team UI ALSO renders inline in the Space profile body as
// the Members `?panel=` workspace (Stage D1). Both share ONE source: the chrome-free <MembersBody>. This
// page keeps the page chrome (FocusTemplate) + the notFound gate, so the standalone route is unchanged.
//
// It gates RENDER on canManage || staffViewing (404s otherwise so a non-editor / non-staff viewer cannot
// tell the surface exists), then wraps <MembersBody> in the FocusTemplate. The FeatureLockedNotice vs full
// roster branch (and every read) lives inside MembersBody; this page only picks the matching template
// chrome (a locked Space keeps the plain, non-wide framing) so the standalone render is byte-identical.

export const metadata = {
  title: 'Members',
}

export default async function SpaceMembersPage({
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

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404
  // (not 403) for everyone else so the surface never confirms it exists.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // Pick the FocusTemplate chrome to match MembersBody's own branch (kept identical to before): a
  // feature-locked Space (Members function off / role-gated for a non-staff viewer) reads with the plain
  // framing + short description; otherwise the wide roster framing. MembersBody re-derives this same
  // condition to render the matching body, so the two never diverge.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const featureLocked = !staffViewing && !spaceFunctionAccess(space, 'members', caps.role)

  if (featureLocked) {
    return (
      <FocusTemplate eyebrow={brandName} title="Members" description="The team for this space.">
        <MembersBody slug={slug} />
      </FocusTemplate>
    )
  }

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Members"
      description="Who is on your team, and the role each one holds. Invite a teammate by email below, then share their link until email delivery ships."
      width="wide"
    >
      <MembersBody slug={slug} />
    </FocusTemplate>
  )
}
