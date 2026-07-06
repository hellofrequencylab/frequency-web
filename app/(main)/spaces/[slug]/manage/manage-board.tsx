import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { resolveMode, readModePreferences, effectiveNavEmphasis } from '@/lib/spaces/modes'
import { isStaff } from '@/lib/core/roles'
import { spaceModuleManifest } from '@/lib/admin/modules/space-modules'
import { readModuleMenuPrefs } from '@/lib/spaces/module-menu'
import { SpaceManageConsole } from './console'

// The Space owner console BOARD (ADR-441 EM1-3): the reusable render boundary that resolves the Space,
// gates on manage access, computes the gated surface spine + Mode emphasis, and renders the console.
// It carries NO chrome (no DashboardTemplate, no stat row, no metadata) so it can drop into the full
// /spaces/[slug]/manage page OR an inline fold-out. Returning null when the viewer can't manage is
// intentional: an inline fold-out simply shows nothing (the full page still notFound()s via its own gate).
//
// SECURITY: a Server Component, gated server-side. It resolves the Space, gates RENDER on
// resolveSpaceManageAccess (canManage owner/admin/editor || staffViewing janitor preview), and renders
// nothing for everyone else. Every surface's mutation re-checks its OWN gate in its settings sub-page,
// so this console gate is UX and the sub-pages stay the authority.
export async function SpaceManageBoard({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  // GATE: only a manager (owner / admin / editor) or a platform janitor preview reaches the console.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  // The console serves every provisionable type except coaching (isConsoleSpaceType, the single source of
  // truth shared with spaceManageHref). A type with no console spine renders nothing here.
  if (!isConsoleSpaceType(space.type)) return null

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2): which tool sections render. A surface whose
  // function the viewer's role cannot use (or that is off / not on the plan) is dropped, exactly like
  // the legacy cockpit. A staff previewer sees them all (read-only; every write stays gated in the
  // sub-page). Basics + Danger have no per-tool function and always render for a manager.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const canUse = (fn: SpaceFunctionKey): boolean =>
    staffViewing || spaceFunctionAccess(space, fn, caps.role)

  // MODULES (docs/MODULAR-MENU.md — P1, ADR-544): the console now renders the SPACE menu from the P0
  // module manifest instead of the legacy space surface spine (retired in P4, ADR-547), so the service
  // split (7 independent
  // commerce modules) + the CRM consolidation (one module absorbing autonomy + pipeline) go live. Take
  // the full catalog (entitlements `{}` = default-on) and gate each module by the SAME authoritative
  // `canUse` the surfaces used (role + plan + entitlement via spaceFunctionAccess): a shell module
  // (`gate.kind === 'always'`) always shows; a service module shows only when its function is usable, so
  // a space with a function off (e.g. availability) drops that module, matching the legacy gating. The
  // console groups these into scannable clusters itself (console.tsx) and does NOT pre-reorder by Mode.
  //
  // MODULE MANAGER OVERRIDES (P3, ADR-546): feed the owner's persisted menu overrides — the module ORDER
  // and the HIDDEN set (spaces.preferences.moduleMenu, read fail-safe) — into the manifest, so a hidden
  // module drops from the console and the owner's order applies. The Module Manager itself (space.modules)
  // is OWNER/ADMIN only (caps.canManageMembers), narrower than the console's editor-level manage gate, so a
  // mere editor / staff previewer never sees the menu-management entry point.
  const menu = readModuleMenuPrefs(space.preferences)
  const modules = spaceModuleManifest({}, { order: menu.order, hidden: menu.hidden }).filter((m) => {
    if (m.id === 'space.modules') return caps.canManageMembers
    return m.gate.kind === 'always' || canUse(m.gate.fn)
  })

  // MODE EMPHASIS (Space Modes M3, ADR-461/464): resolve the Space's Mode ONCE (no N+1) and hand the
  // console the emphasized FUNCTION list as framing only.
  const mode = resolveMode(space.type, space.modeVariant)
  const prefs = readModePreferences(space.preferences)
  const emphasis = effectiveNavEmphasis(mode, prefs)

  // Deleting a Space is OWNER-grade (or platform staff). The Danger section's control only renders
  // when this is true; otherwise the section shows header-only (mirrors circle's Danger).
  const canDelete = caps.isOwner || isStaff(caller?.webRole)

  return (
    <SpaceManageConsole
      slug={space.slug}
      modules={modules}
      emphasis={emphasis}
      canDelete={canDelete}
      spaceId={space.id}
    />
  )
}
