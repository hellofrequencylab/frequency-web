'use client'

import { useEffect, useState, type ComponentType } from 'react'
import { usePathname } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import { meetsAccess } from '@/lib/nav-areas'
import { isModuleRoute } from '@/lib/widgets/module-routes'
import { LayoutEditor } from '@/components/admin/page-settings/layout-editor'
import { EventDangerZone } from '@/components/admin/modules/event-danger-zone'
import { CircleQuestModule } from '@/components/admin/modules/circle-quest-module'
import { PageContentModule } from '@/components/admin/modules/page-content-module'
import { MODULE_COMPONENTS } from '@/components/admin/modules/module-map'
import type { AdminSlot } from '@/lib/admin/modules/registry'
import { adminScopeFor, type AdminScope } from '@/lib/layout/page-chrome'
import type { OpenAdminBarDetail } from '@/components/admin/open-admin-bar'
import { appsForScope } from '@/lib/apps/for-scope'
import { APPS } from '@/lib/apps/catalog'
import type { App, AppViewer } from '@/lib/apps/types'
import { usePageAdmin } from '@/components/layout/page-admin-context'
import { CONTENT_EDIT_ROUTES } from '@/lib/layout/editable-content'
import { isStaff } from '@/lib/core/roles'
import { PageSettingsModule } from '@/components/admin/page-settings/page-settings-module'

// The SETTINGS CONTENT — the registry-selected manager modules (Page settings, Circle Quest, page
// content) plus the operator "Page" group (Layout / SEO / Status), resolved from the pathname.
// Extracted from SettingsDrawer so BOTH the desktop slide-over (SettingsDrawer) and the mobile
// full-screen sheet (MobileSettingsSheet) render the SAME content from one source. Each surface
// owns only its own chrome (header / positioning); the body is this hook.

// The 9-spine category order (EMBEDDED-ADMIN.md; the AdminSlot union in lib/admin/modules/registry).
// The manage modules group in this order. Kept in sync with that union.
const SLOT_ORDER: readonly AdminSlot[] = [
  'basics', 'place', 'people', 'layout', 'engage', 'reach', 'comms', 'safety', 'insights', 'billing', 'danger',
]

// A caps-BLIND selection viewer that passes every editor App's own gate. LP4 makes the manage-module
// list CATALOG-DRIVEN (appsForScope over the App catalog) instead of a path-sniffing scope table, but
// keeps selection caps-blind — each module still self-gates server-side, and the coarse `manager`
// gate below decides whether the bar shows at all. Resolving against a viewer that holds every editor
// capability makes the resolved id set byte-for-byte the modulesForScopeKind(kind, 'sidebar') set it
// replaces (proven in lib/apps/for-scope.test.ts). Used only until the provider threads the viewer's
// REAL resolved caps (the B2 follow-up).
const SELECTION_VIEWER: AppViewer = {
  caps: new Set(
    APPS.flatMap((a) => (a.surfaces.editor && a.gate.system === 'capability' ? [a.gate.capability] : [])),
  ),
}

// The entity scope kinds — a page in one of these carries its identity through its own manage
// modules, so the generic operator "Page" group is dropped there (see useSettingsPanel).
const ENTITY_KINDS: ReadonlySet<string> = new Set([
  'circle', 'hub', 'nexus', 'event', 'practice', 'channel', 'profile',
])

/** Whether this path is an entity-detail scope (vs the operator `global` scope or a takeover). */
function isEntityScope(pathname: string): boolean {
  const scope = adminScopeFor(pathname)
  return !!scope && ENTITY_KINDS.has(scope.kind)
}

// The sidebar ("manage") modules for a scope, resolved from the App CATALOG (LP4 / ADR-501) and
// grouped by 9-spine category. Each maps to its registered component; each self-resolves from the
// pathname and re-gates server-side, so caps-blind selection is safe.
function settingsModulesFor(scope: AdminScope | null, viewer: AppViewer): ComponentType[] {
  if (!scope) return []
  const apps = appsForScope(scope, viewer, 'editor')
  // Group by the 9-spine category in AdminSlot order (today every manage module is 'basics', so this
  // preserves the current single-group list). LP4 follow-up: drill-down (category rows → detail).
  const ordered: App[] = SLOT_ORDER.flatMap((slot) => apps.filter((a) => a.category === slot))
  return ordered
    .map((a) => MODULE_COMPONENTS[a.id])
    .filter((C): C is ComponentType => !!C)
}

function questModuleFor(pathname: string) {
  if (/^\/circles\/[^/]+/.test(pathname)) return <CircleQuestModule />
  return null
}

/** True at the lg breakpoint (>= 1024px). Lets the desktop SettingsDrawer and the
 *  MobileSettingsSheet each render at only ONE breakpoint, so the settings modules never
 *  double-mount in a hidden twin. SSR-safe: starts false, resolves on mount. */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isDesktop
}

/** Resolve the settings BODY for the current route + viewer, shared by the desktop drawer and the
 *  mobile sheet. `hasContent` lets each chrome decide whether to render at all (an empty drawer /
 *  sheet should never show). The body markup is identical across both surfaces. */
export function useSettingsPanel(
  detail?: OpenAdminBarDetail,
): { hasContent: boolean; content: React.ReactNode } {
  const { role, staffRole, webRole, caps: providerCaps } = usePageAdmin()
  const pathname = usePathname()

  // Prefer the scope the trigger already resolved (detail.scope carries the entity's DB id) over the
  // pathname; with no detail this is exactly adminScopeFor(pathname), as before.
  const scope = detail?.scope ?? adminScopeFor(pathname)

  // What this viewer can administer: page MANAGERS (host+ / staff — each module re-gates
  // server-side) and platform OPERATORS (web_role admin/janitor, who get the page-level group).
  const manager = meetsAccess('host', role) || staffRole != null
  const isOperator = isStaff(webRole)

  // The viewer for catalog selection. Precedence (docs/ADMIN-RAIL.md Phase 1):
  //   1. detail.caps — the page resolved the REAL caps for this scope (the entity "Edit" buttons ride
  //      them on the event), so gate the module selection on the true set.
  //   2. providerCaps on the GLOBAL scope only — the shell threads getGlobalCapabilities() through the
  //      provider. Those caps are the viewer's real set for the global scope, where the editor set is
  //      empty regardless (there are no global-scoped editor Apps), so this is behavior-preserving; it
  //      is deliberately NOT used on an entity scope, where global caps would wrongly drop the entity's
  //      modules — those keep the caps-blind fallback until their real caps ride a detail.
  //   3. SELECTION_VIEWER — the caps-blind fallback reproducing the prior modulesForScopeKind set.
  const viewer: AppViewer = detail?.caps
    ? { caps: new Set(detail.caps) }
    : providerCaps && scope?.kind === 'global'
      ? { caps: providerCaps }
      : SELECTION_VIEWER
  const settingsModules = manager ? settingsModulesFor(scope, viewer) : []
  const hasSettings = settingsModules.length > 0
  const isCircle = manager && /^\/circles\/[^/]+/.test(pathname)
  const questModule = manager ? questModuleFor(pathname) : null
  // The full page-content editor (title / description / hero / CTA). ADMIN routes are excluded.
  const contentModule =
    manager &&
    !pathname.startsWith('/admin') &&
    (CONTENT_EDIT_ROUTES as readonly string[]).includes(pathname) &&
    meetsAccess('admin', role) ? (
      <PageContentModule />
    ) : null

  // The generic "Page" group is for operator CONTENT pages. An entity-detail page owns its identity
  // through its OWN settings block above, so the generic group is dropped on every entity scope.
  const entityScope = isEntityScope(pathname)
  const showPageSettings = isOperator && !entityScope

  // Module-driven detail pages (circle / event) get the Layout editor (operator-only, network-wide).
  const showCircleLayout = isCircle && isOperator && isModuleRoute(pathname)
  const isEvent = manager && /^\/events\/[^/]+/.test(pathname)
  const showEventLayout = isEvent && isOperator && isModuleRoute(pathname)

  const hasContent =
    hasSettings || !!questModule || !!contentModule || showPageSettings || showCircleLayout || showEventLayout || isEvent

  if (!hasContent) return { hasContent: false, content: null }

  // The page-settings column — the registry-selected sidebar modules for this scope.
  const settingsBlock = hasSettings ? (
    <div className="min-w-0">
      <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Page settings</p>
      <div className="space-y-6">
        {settingsModules.map((ModuleComponent, i) => (
          <ModuleComponent key={i} />
        ))}
      </div>
    </div>
  ) : null

  const content = (
    <div className="space-y-5">
      {isCircle ? (
        <div className="space-y-6">
          {settingsBlock}
          {questModule && <div className="min-w-0">{questModule}</div>}
          {showCircleLayout && (
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <span className="text-sm font-semibold text-text">Layout</span>
              </div>
              <p className="mb-2 text-xs text-muted">
                Choose which blocks show inside the circle page and their order. Tunes the page, never the app shell.
              </p>
              <LayoutEditor />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {settingsBlock}
          {questModule && <div className="min-w-0">{questModule}</div>}
          {contentModule && <div className="min-w-0">{contentModule}</div>}
          {showEventLayout && (
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <span className="text-sm font-semibold text-text">Layout</span>
              </div>
              <p className="mb-2 text-xs text-muted">
                Choose which blocks show inside the event page and their order. Tunes the page, never the app shell.
              </p>
              <LayoutEditor />
            </div>
          )}
          {/* Cancel + Delete live at the very bottom, BELOW the Layout picker — the
              destructive controls sit under everything else in the drawer. */}
          {isEvent && (
            <div className="min-w-0">
              <EventDangerZone />
            </div>
          )}
        </div>
      )}

      {/* The operator page-globals group, set apart by a hairline. Suppressed on entity scopes. */}
      {showPageSettings && (hasSettings || !!questModule || !!contentModule) && (
        <hr className="border-border" />
      )}
      {showPageSettings && <PageSettingsModule hideBasics={!!contentModule} />}
    </div>
  )

  return { hasContent: true, content }
}
