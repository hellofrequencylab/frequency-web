import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { usableSpaceFunctions } from '@/lib/spaces/functions'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { isStaff } from '@/lib/core/roles'
import { resolveSpaceMenu } from '@/lib/admin/modules/space-menu'
import { readModuleMenuPrefs } from '@/lib/spaces/module-menu'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { FocusTemplate } from '@/components/templates'
import { SpaceSettingsSurface } from '../console'

// PROFILE & SETTINGS — the header-level configuration surface for a Space (ADR-785). Everything that is
// SETUP rather than daily operation: the space's identity / brand / page theme / visibility (the basics
// form), its Team and roles, Reviews, Plan & usage, and the Danger zone. Reached from the "Profile &
// Settings" button in the /manage hub header, NOT one of the four browse categories.
//
// SECURITY: a Server Component, gated exactly like the hub — resolveSpaceManageAccess (manager or staff
// preview), notFound() otherwise, and every sub-surface re-gates its own writes.

export const metadata: Metadata = {
  title: 'Profile and settings',
  description: "Your space's identity, team, reviews, plan, and danger zone.",
  robots: { index: false, follow: false },
}

export default async function SpaceProfileSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()
  if (!isConsoleSpaceType(space.type)) notFound()

  // The gated module manifest, resolved by the SAME shared path the hub uses (so the two never drift).
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const usable = new Set(usableSpaceFunctions(space, caps.role, staffViewing))
  const menu = readModuleMenuPrefs(space.preferences)
  const modules = resolveSpaceMenu(
    { canUse: (fn) => usable.has(fn), canManageMenu: caps.canManageMembers },
    { order: menu.order, hidden: menu.hidden },
  )
  const canDelete = caps.isOwner || isStaff(caller?.webRole)

  return (
    <FocusTemplate
      eyebrow={`Manage ${spaceTypeLabel(space.type).toLowerCase()} space`}
      title="Profile and settings"
      description="Your space's identity, team, reviews, plan, and the danger zone."
      back={{ href: `/spaces/${space.slug}/manage`, label: 'Back to hub' }}
      width="wide"
    >
      <SpaceSettingsSurface slug={space.slug} modules={modules} canDelete={canDelete} spaceId={space.id} />
    </FocusTemplate>
  )
}
