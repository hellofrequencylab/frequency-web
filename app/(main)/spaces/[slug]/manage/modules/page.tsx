import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { spaceFunctionDef, spaceFunctionEnabled, spaceFunctionMinRole } from '@/lib/spaces/functions'
import { spaceModuleManifest, isModuleHideable } from '@/lib/admin/modules/space-modules'
import { readModuleMenuPrefs } from '@/lib/spaces/module-menu'
import { FocusTemplate } from '@/components/templates'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { ModuleManager, type ModuleManagerRow } from './module-manager'

// THE MODULE MANAGER (ADR-546, docs/MODULAR-MENU.md — P3). A centered, no-rail Focus sub-page where the
// owner turns each SERVICE feature on or off, reorders the modules in their menu, and hides the ones they
// do not use. The console + rail render from spaceModuleManifest(entitlements, { order, hidden }); this
// page persists those overrides (spaces.preferences.moduleMenu) + the feature toggles (spaces.entitlements).
//
// GATING (identical to the sibling owner sub-surfaces, e.g. settings/features): resolve the Space, fail
// closed on a missing / not-visible Space (404, no existence leak), gate RENDER on canManage || staffViewing,
// then gate EDITING on caps.canManageMembers (owner / admin) — every write action re-checks the same, so an
// editor / staff previewer sees the panel read-only and cannot write through it. The route falls through to
// the default 'global' rail like the mode + features pages (no page-chrome entry needed). No em dashes.

export const metadata: Metadata = {
  title: 'Menu and features',
  description: 'Turn features on or off, set who can use each one, reorder your menu, and hide what you do not use.',
  robots: { index: false, follow: false },
}

export default async function SpaceModulesPage({
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
  // everyone else so the route is never revealed. The WRITE actions gate on canManageMembers (owner /
  // admin), so an editor / staff viewer sees the panel read-only.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()
  if (!isConsoleSpaceType(space.type)) notFound()

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const readOnly = staffViewing || !caps.canManageMembers

  const brandName = space.brandName ?? space.name

  // Build the rows: EVERY catalog module, in the owner's current menu order (spaceModuleManifest with the
  // saved order and no hidden filter returns the full catalog so hidden modules stay visible here to be
  // un-hidden). Each module's current on/off + lock come from the Space's entitlements + plan.
  const menu = readModuleMenuPrefs(space.preferences)
  const hiddenSet = new Set(menu.hidden)
  const rows: ModuleManagerRow[] = spaceModuleManifest({}, { order: menu.order }).map((m) => {
    const key = m.gate.kind === 'feature' ? m.gate.fn : m.featureKey
    const def = key ? spaceFunctionDef(key) : null
    const on = def ? spaceFunctionEnabled(space, def) : true
    return {
      id: m.id,
      label: m.label,
      desc: m.desc,
      family: m.family,
      tier: m.tier,
      featureKey: m.featureKey,
      enabled: on,
      // A plan-gated feature the plan does not grant is LOCKED (the owner cannot out-grant their plan).
      locked: def?.entitlement != null && !on,
      // The lowest role that may use this module (owner tunes team access from the same row). Shell
      // modules with no function fall back to 'viewer' (unused: the row shows no role picker).
      minRole: def ? (spaceFunctionMinRole(space, def.key) ?? def.defaultMinRole) : 'viewer',
      defaultMinRole: def?.defaultMinRole ?? 'viewer',
      hideable: isModuleHideable(m.id),
      hidden: hiddenSet.has(m.id),
    }
  })

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Menu and features"
      description="Turn the tools this space uses on or off, set who on your team can use each one, reorder your menu, and hide what you do not need."
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}
      <ModuleManager slug={space.slug} rows={rows} readOnly={readOnly} />
    </FocusTemplate>
  )
}
