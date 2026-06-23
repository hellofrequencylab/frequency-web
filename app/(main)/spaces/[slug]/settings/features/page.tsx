import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import {
  functionsForType,
  spaceFunctionEnabled,
  spaceFunctionMinRole,
} from '@/lib/spaces/functions'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeaturePanel, type OwnerFunctionRow } from './feature-panel'

// OWNER FEATURES AND ACCESS (per-space-roles Phase 1). A centered, no-rail Focus sub-page where the
// owner turns the tools their space uses on or off and sets the lowest role that can use each one. The
// rail is registered 'none' for /spaces/<slug>/settings/features in page-chrome.ts, alongside the other
// owner sub-surfaces.
//
// GATING (identical to the other owner sub-surfaces): resolve the Space, fail closed on a missing /
// not-visible Space (404, no existence leak), then gate RENDER on canManage || staffViewing. EDITING is
// further gated on caps.canManageMembers (owner / admin) inside the write actions, so a mere editor or a
// staff viewer sees the panel read-only and cannot write through it.
//
// Within entitlements: a universal function is a free toggle; a plan-gated function (CRM, email) the
// plan LACKS renders LOCKED with an upgrade nudge; one the plan grants is a normal toggle. No em dashes.

export const metadata = {
  title: 'Features and access',
}

export default async function SpaceFeaturesPage({
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

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404 for
  // everyone else. The WRITE actions gate on canManageMembers (owner / admin), so an editor / staff
  // viewer sees the panel read-only.
  const access = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!access.canManage && !access.staffViewing) notFound()

  // A mere editor (canManage but not canManageMembers) and a staff viewer both see the panel read-only.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const readOnly = access.staffViewing || !caps.canManageMembers

  const brandName = space.brandName ?? space.name

  // Build the rows: every function this Space type offers, with its current resolved on/off + min-role.
  // A plan-gated function the plan does NOT grant is LOCKED (the owner cannot out-grant their plan; that
  // is the operator's absolute override). Pure resolution off the Space's entitlements + feature_roles.
  const rows: OwnerFunctionRow[] = functionsForType(space.type).map((fn) => {
    const enabled = spaceFunctionEnabled(space, fn)
    const locked = fn.entitlement !== null && !enabled // plan-gated + not granted -> upgrade nudge
    return {
      key: fn.key,
      label: fn.label,
      description: fn.description,
      planGated: fn.entitlement !== null,
      locked,
      enabled,
      minRole: spaceFunctionMinRole(space, fn.key) ?? fn.defaultMinRole,
      defaultMinRole: fn.defaultMinRole,
    }
  })

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Features and access"
      description="Turn the tools this space uses on or off, and set who on your team can use each one."
      back={{ href: `/spaces/${space.slug}/settings`, label: `Manage ${brandName}` }}
    >
      {access.staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <FeaturePanel slug={space.slug} rows={rows} readOnly={readOnly} />
    </FocusTemplate>
  )
}
