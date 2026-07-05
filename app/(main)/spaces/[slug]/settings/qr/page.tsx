import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { QrBody } from './qr-body'

// OWNER QR STUDIO per space (ENTITY-SPACES-BUILD §C, Phase 2). A centered, no-rail Focus surface
// (registered 'none' for /spaces/<slug>/settings/qr in page-chrome.ts, alongside the other settings
// sub-surfaces). It resolves the Space, gates RENDER on canManage || staffViewing (404s otherwise so a
// non-editor / non-staff viewer cannot tell the surface exists), then wraps the chrome-free <QrBody> in
// the FocusTemplate. The same body ALSO renders inline in the Space profile as the QR codes `?panel=`
// workspace (Stage D2). The FeatureLockedNotice vs full studio branch (and every read) lives inside QrBody;
// this page only picks the matching template chrome (a locked Space keeps the plain, non-wide framing) so
// the standalone render is byte-identical.
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): the form renders READ-ONLY. The write
// actions stay gated on canEditProfile server-side, so staff viewing never confers a write. VOICE
// (CONTENT-VOICE §10): plain labels, no narrated feelings, no em/en dashes.

export const metadata = {
  title: 'QR codes',
}

export default async function SpaceQrPage({
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
  // (not 403) for everyone else. The WRITE actions stay gated on canEditProfile, so staff is read-only.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // Pick the FocusTemplate chrome to match QrBody's own branch (kept identical to before): a feature-locked
  // Space (QR function off / role-gated for a non-staff viewer) reads with the plain framing + short
  // description; otherwise the wide studio framing. QrBody re-derives this same condition to render the
  // matching body, so the two never diverge.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const featureLocked = !staffViewing && !spaceFunctionAccess(space, 'qr', caps.role)

  if (featureLocked) {
    return (
      <FocusTemplate eyebrow={brandName} title="QR codes" description="The codes for this space.">
        <QrBody slug={slug} />
      </FocusTemplate>
    )
  }

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="QR codes"
      description="Make a code that points anywhere, and change where it goes any time without a reprint. Add a splash landing when you want a scan to see a page first."
      width="wide"
    >
      <QrBody slug={slug} />
    </FocusTemplate>
  )
}
