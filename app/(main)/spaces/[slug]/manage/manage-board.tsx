import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { usableSpaceFunctions } from '@/lib/spaces/functions'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { resolveMode, readModePreferences, effectiveNavEmphasis } from '@/lib/spaces/modes'
import { isStaff } from '@/lib/core/roles'
import { resolveSpaceMenu } from '@/lib/admin/modules/space-menu'
import { readModuleMenuPrefs } from '@/lib/spaces/module-menu'
import { asHubSection, type SpaceHubSection } from '@/lib/admin/modules/space-hub'
import { SpaceResonanceCrm } from '@/components/spaces/crm/space-resonance-crm'
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
export async function SpaceManageBoard({ slug, section: rawSection }: { slug: string; section?: string }) {
  const section = asHubSection(rawSection)
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
  // The per-Space FUNCTIONS this viewer may use — resolved by the SHARED helper the rail's Customize
  // trigger also feeds (usableSpaceFunctions), so the console + rail gate the Space menu identically and
  // can never drift. A staff previewer sees them all (read-only; every write re-gates in its sub-page).
  const usable = new Set(usableSpaceFunctions(space, caps.role, staffViewing))

  // MODULES (docs/MODULAR-MENU.md — P1, ADR-544): the console renders the SPACE menu from the P0 module
  // catalog (SPACE_MODULES) via the SHARED resolver (lib/admin/modules/space-menu.ts resolveSpaceMenu) —
  // the SAME catalog + gate the rail derives its App lane from (SPACE_EDITOR_APPS), so the service split
  // (7 independent commerce modules) + the CRM consolidation stay in lock-step across both owner surfaces.
  // The resolver gates a shell module always (except the Module Manager, which needs canManageMenu), a
  // service module iff its function is usable, and applies the owner's Module Manager overrides — the ORDER
  // + HIDDEN set (spaces.preferences.moduleMenu, read fail-safe). The console groups the flat result into
  // its scannable clusters itself (console.tsx) and does NOT pre-reorder by Mode.
  const menu = readModuleMenuPrefs(space.preferences)
  const modules = resolveSpaceMenu(
    { canUse: (fn) => usable.has(fn), canManageMenu: caps.canManageMembers },
    { order: menu.order, hidden: menu.hidden },
  )

  // MODE EMPHASIS (Space Modes M3, ADR-461/464): resolve the Space's Mode ONCE (no N+1) and hand the
  // console the emphasized FUNCTION list as framing only.
  const mode = resolveMode(space.type, space.modeVariant)
  const prefs = readModePreferences(space.preferences)
  const emphasis = effectiveNavEmphasis(mode, prefs)

  // Resonance IS the space's Resonance CRM: the EXACT admin /admin/crm composition (header + Import + the
  // four health stat cards + the master-detail member viewer), scoped to this space + gated on space-manage.
  const brandName = space.brandName ?? space.name
  const crmEmbed =
    section === 'resonance' ? (
      <SpaceResonanceCrm spaceId={space.id} slug={space.slug} spaceName={brandName} />
    ) : undefined

  // Deleting a Space is OWNER-grade (or platform staff): the Profile & Settings tab's Danger zone renders
  // its delete control only when true; otherwise header-only.
  const canDelete = caps.isOwner || isStaff(caller?.webRole)

  return (
    <SpaceManageConsole
      slug={space.slug}
      modules={modules}
      emphasis={emphasis}
      section={section}
      crmEmbed={crmEmbed}
      canDelete={canDelete}
      spaceId={space.id}
    />
  )
}

/** The section type re-exported for the page shell (which reads `?section=` and hands it here). */
export type { SpaceHubSection }
