import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { EmailBody } from './email-body'

// OWNER EMAIL SURFACE (ENTITY-SPACES-BUILD §C Phase 3, "campaign authoring"). A centered, no-rail Focus
// surface (registered 'none' for /spaces/<slug>/settings/email in page-chrome.ts, alongside the other
// owner sub-surfaces). It resolves the Space, gates RENDER on canManage || staffViewing (404s otherwise so
// a non-editor / non-staff viewer cannot tell the surface exists), then wraps the chrome-free <EmailBody>
// in the FocusTemplate. The same body ALSO renders inline in the Space profile as the Email `?panel=`
// workspace (Stage D2). The FeatureLockedNotice vs full composer branch (and every read) lives inside
// EmailBody; this page only picks the matching template chrome (a locked Space keeps the plain, non-wide
// framing) so the standalone render is byte-identical.
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): the composer / enable card render read-only.
// Every WRITE action stays gated on canEditProfile server-side. SENDING is wired to the backbone seam
// (sendSpaceCampaign / the kill-switch in @/lib/spaces/email).

export const metadata = {
  title: 'Email',
}

export default async function SpaceEmailPage({
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
  // (not 403) for everyone else. The WRITE actions stay gated on canEditProfile, so staff viewing is
  // read-only end to end.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // Pick the FocusTemplate chrome to match EmailBody's own branch (kept identical to before): a
  // feature-locked Space (email plan/role-gated for a non-staff viewer) reads with the plain framing +
  // short description; otherwise the wide composer framing. EmailBody re-derives this same condition
  // (spaceFunctionAccessLive, LIVE gate ADR-370) to render the matching body, so the two never diverge.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const featureLocked =
    !staffViewing && !(await spaceFunctionAccessLive(space, 'email', caps.role, space.plan))

  if (featureLocked) {
    return (
      <FocusTemplate eyebrow={brandName} title="Email" description="Campaigns for this space.">
        <EmailBody slug={slug} />
      </FocusTemplate>
    )
  }

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Email"
      description="Write a campaign, pick who gets it from your own contacts, and send or schedule it."
      width="wide"
    >
      <EmailBody slug={slug} />
    </FocusTemplate>
  )
}
