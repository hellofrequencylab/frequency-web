import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { readProfileData } from '@/lib/spaces/profile-data'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { SpaceServicesForm } from '@/components/spaces/space-services-form'

// SERVICES BODY — the chrome-free storefront store-item editor, lifted out of the standalone
// /settings/services page (Stage D2) so it renders in TWO places from one source: (1) that page, wrapped
// in its FocusTemplate chrome, and (2) INLINE in the Space profile body as the Services `?panel=`
// workspace (components/spaces/workspace/space-body-panel.tsx). It owns NO page chrome (the caller frames
// it) and SELF-GATES server-side so it is safe to mount anywhere: it returns null when the viewer may not
// manage this Space (the standalone page still 404s via its own gate, so a null here never renders a bare
// 200). Staff preview is read-only (the form renders disabled). COPY: plain labels, no em/en dashes.

export async function ServicesBody({ slug }: { slug: string }) {
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

  const brandName = space.brandName ?? space.name
  const services = readProfileData(space.preferences).offerings ?? []

  return (
    <>
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}
      <SpaceServicesForm slug={slug} initial={services} readOnly={!canManage} />
    </>
  )
}
