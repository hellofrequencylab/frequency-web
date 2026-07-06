// The Operator Console scope-context (P0:2). Server-only glue that assembles a ViewerCtx for the pure
// resolver (lib/operator/visible.ts) by COMPOSING existing, shipped primitives — no new auth logic:
//   root  → requireAdminFloor() (redirects if not staff) + the team_members staff matrix
//   space → getSpaceBySlug + resolveSpaceManageAccess (notFound if the viewer cannot manage) +
//           getSpaceCapabilities + spaceFunctionEnabled
// The plan axis is OFF-safe: billingLive() gates it, and while OFF every plan gate grants.

import 'server-only'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { requireAdminFloor } from '@/lib/admin/guard'
import { staffCan, STAFF_DOMAINS, type StaffDomain } from '@/lib/core/staff-roles'
import { getSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities, resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { SPACE_FUNCTIONS, spaceFunctionEnabled, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { billingLive } from '@/lib/pricing/settings'
import { featureAllowed } from '@/lib/pricing/gates'
import { OPERATOR_CONSOLE } from './console'
import type { ViewerCtx } from './visible'

/** Every distinct plan gate referenced by the registry (so we resolve each once per request). */
function registryPlanGates(): string[] {
  const set = new Set<string>()
  for (const ws of OPERATOR_CONSOLE) for (const t of ws.subtabs) if (t.planGate) set.add(t.planGate)
  return [...set]
}

/** The staff capability domains a role holds at read level or above. */
function staffDomainsFor(staffRole: Parameters<typeof staffCan>[0]): StaffDomain[] {
  return STAFF_DOMAINS.filter((d) => staffCan(staffRole, d, 'read'))
}

/** Root scope: the platform operator (a Space of type='root'). requireAdminFloor() redirects a
 *  non-operator, so reaching the return means the viewer may enter the console at root. The root
 *  platform is not plan-limited, so it clears every plan gate. */
export async function getRootScopeContext(): Promise<ViewerCtx> {
  const { webRole, staffRole } = await requireAdminFloor()
  return {
    scope: 'root',
    webRole,
    staffDomains: staffDomainsFor(staffRole),
    billingLive: await billingLive(),
    clearedPlanGates: new Set(registryPlanGates()),
  }
}

/** Space scope: a tenant Space. notFound() for a viewer who can neither manage nor staff-preview it,
 *  mirroring the existing settings guard (never widens access). */
export async function getSpaceScopeContext(slug: string): Promise<ViewerCtx> {
  const profile = await getCallerProfile()
  const space = await getSpaceBySlug(slug)
  if (!space) notFound()

  const access = await resolveSpaceManageAccess(space, profile?.id, profile?.webRole)
  if (!access.canManage && !access.staffViewing) notFound()

  const caps = await getSpaceCapabilities(space, profile?.id)
  // Owner/admin/editor carry a real SpaceRole; a janitor previewing (staffViewing) has full read.
  const spaceRole = caps.role ?? (access.staffViewing ? 'admin' : null)

  const enabledSpaceFns = new Set<SpaceFunctionKey>(
    SPACE_FUNCTIONS.filter((fn) => spaceFunctionEnabled(space, fn)).map((fn) => fn.key),
  )

  const live = await billingLive()
  const clearedPlanGates = new Set<string>()
  if (live) {
    const plan = space.plan ?? undefined
    for (const key of registryPlanGates()) {
      // featureAllowed's FeatureKey is a string union; the registry keys are valid members.
      const allowed = await featureAllowed(
        key as Parameters<typeof featureAllowed>[0],
        { plan: plan as never },
        { billingLive: live },
      )
      if (allowed) clearedPlanGates.add(key)
    }
  }

  return {
    scope: 'space',
    spaceRole,
    spaceType: space.type ?? null,
    enabledSpaceFns,
    billingLive: live,
    clearedPlanGates,
  }
}
