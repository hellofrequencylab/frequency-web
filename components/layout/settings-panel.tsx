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
import { modulesForScopeKind, type ScopeKind } from '@/lib/admin/modules/registry'
import { usePageAdmin } from '@/components/layout/page-admin-context'
import { CONTENT_EDIT_ROUTES } from '@/lib/layout/editable-content'
import { isStaff } from '@/lib/core/roles'
import { PageSettingsModule } from '@/components/admin/page-settings/page-settings-module'

// The SETTINGS CONTENT — the registry-selected manager modules (Page settings, Circle Quest, page
// content) plus the operator "Page" group (Layout / SEO / Status), resolved from the pathname.
// Extracted from SettingsDrawer so BOTH the desktop slide-over (SettingsDrawer) and the mobile
// full-screen sheet (MobileSettingsSheet) render the SAME content from one source. Each surface
// owns only its own chrome (header / positioning); the body is this hook.

// Which scope kind an entity-detail path represents — the bridge from a URL to the admin-module
// registry. Mirrors PageAdminBar's resolver.
const PATH_SCOPE_KINDS: readonly { prefix: RegExp; kind: ScopeKind }[] = [
  { prefix: /^\/circles\/[^/]+/, kind: 'circle' },
  { prefix: /^\/hubs\/[^/]+/, kind: 'hub' },
  { prefix: /^\/nexuses\/[^/]+/, kind: 'nexus' },
  { prefix: /^\/events\/[^/]+/, kind: 'event' },
  { prefix: /^\/practices\/[^/]+/, kind: 'practice' },
  { prefix: /^\/channels\/[^/]+/, kind: 'channel' },
  { prefix: /^\/people\/[^/]+/, kind: 'profile' },
]

function scopeKindForPath(pathname: string): ScopeKind | null {
  return PATH_SCOPE_KINDS.find((e) => e.prefix.test(pathname))?.kind ?? null
}

// The sidebar ("manage") modules for this path, resolved from the registry. Each module
// self-resolves from the pathname and re-gates server-side; selection here is by scope kind.
function settingsModulesFor(pathname: string): ComponentType[] {
  const kind = scopeKindForPath(pathname)
  if (!kind) return []
  return modulesForScopeKind(kind, 'sidebar')
    .map((m) => MODULE_COMPONENTS[m.id])
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
export function useSettingsPanel(): { hasContent: boolean; content: React.ReactNode } {
  const { role, staffRole, webRole } = usePageAdmin()
  const pathname = usePathname()

  // What this viewer can administer: page MANAGERS (host+ / staff — each module re-gates
  // server-side) and platform OPERATORS (web_role admin/janitor, who get the page-level group).
  const manager = meetsAccess('host', role) || staffRole != null
  const isOperator = isStaff(webRole)

  const settingsModules = manager ? settingsModulesFor(pathname) : []
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
  const isEntityScope = scopeKindForPath(pathname) !== null
  const showPageSettings = isOperator && !isEntityScope

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
