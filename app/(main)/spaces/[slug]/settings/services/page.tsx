import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { ServicesBody } from './services-body'

// THE SERVICES MANAGEMENT SURFACE. A no-rail Focus surface where the operator CRUDs their storefront
// store items: each service with full pricing (fixed / from / free / contact, deposit, duration,
// recurring cadence, package, sliding scale) and a listed/private visibility toggle. The editor saves
// through the owner-gated setSpaceServices action; this page owns the ROUTE + AUTH gate once
// (resolveSpaceManageAccess, notFound on a miss so there is no existence leak), then wraps the chrome-free
// <ServicesBody> in the FocusTemplate. The same body ALSO renders inline in the Space profile as the
// Services `?panel=` workspace (Stage D2). Staff preview is read-only (the form renders disabled).

export const metadata = {
  title: 'Services',
}

export default async function SpaceServicesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

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
      title="Services"
      description="Your store items, with their pricing. Listed services show on your space page; private ones open only from a direct link."
      width="wide"
    >
      <ServicesBody slug={slug} />
    </FocusTemplate>
  )
}
