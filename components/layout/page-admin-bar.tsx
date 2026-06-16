'use client'

import { useState, type ComponentType } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { PageQrManager, PageShareKit } from '@/components/qr/page-qr-manager'
import { meetsAccess } from '@/lib/nav-areas'
import { CircleQuestModule } from '@/components/admin/modules/circle-quest-module'
import { CircleRailModule } from '@/components/admin/modules/circle-rail-module'
import { PageContentModule } from '@/components/admin/modules/page-content-module'
import { MODULE_COMPONENTS } from '@/components/admin/modules/module-map'
import { modulesForScopeKind, type ScopeKind } from '@/lib/admin/modules/registry'
import { usePageAdmin } from '@/components/layout/page-admin-context'
import { CONTENT_EDIT_ROUTES } from '@/lib/layout/editable-content'
import { isStaff } from '@/lib/core/roles'
import { PageSettingsModule } from '@/components/admin/page-settings/page-settings-module'

// Header content (title + description) is operator-editable on the routes registered
// in lib/layout/editable-content.ts (ADR-180). Admin+ only.

// The on-page admin control. A small, right-aligned "Settings ▾" button sits above a
// content-width hairline rule (matching the divider under a page title). Clicking it
// opens an interior panel — within the content column, not edge-to-edge — that holds
// ONLY this page's relevant admin: a share kit (QR + link) on shareable entity pages,
// and the page-specific settings module (circle / hub / nexus / event). If a page has
// neither, the whole control renders nothing. Collapsed by default; auto-collapses on
// navigation.

// Entity detail routes that carry a slug segment (not the bare list route) — these are
// the shareable pages that get a QR/link kit.
const SHAREABLE_PREFIXES = [
  'events',
  'circles',
  'channels',
  'people',
  'hubs',
  'nexuses',
] as const

function isShareable(pathname: string): boolean {
  const m = pathname.match(/^\/([^/]+)\/([^/]+)/)
  if (!m) return false
  return (SHAREABLE_PREFIXES as readonly string[]).includes(m[1])
}

// Which scope kind an entity-detail path represents — the bridge from a URL to the
// admin-module registry (ADR-250 step 1). The dock no longer hardcodes a module per
// path; it asks the registry which modules exist for this scope kind.
const PATH_SCOPE_KINDS: readonly { prefix: RegExp; kind: ScopeKind }[] = [
  { prefix: /^\/circles\/[^/]+/, kind: 'circle' },
  { prefix: /^\/hubs\/[^/]+/, kind: 'hub' },
  { prefix: /^\/nexuses\/[^/]+/, kind: 'nexus' },
  { prefix: /^\/events\/[^/]+/, kind: 'event' },
  { prefix: /^\/channels\/[^/]+/, kind: 'channel' },
  { prefix: /^\/people\/[^/]+/, kind: 'profile' },
]

function scopeKindForPath(pathname: string): ScopeKind | null {
  return PATH_SCOPE_KINDS.find((e) => e.prefix.test(pathname))?.kind ?? null
}

// The sidebar ("manage") modules to render for this path, resolved from the registry.
// Each module self-resolves from the pathname and re-gates server-side, so selection
// here is by scope kind; an unauthorized viewer simply sees an empty module.
function settingsModulesFor(pathname: string): ComponentType[] {
  const kind = scopeKindForPath(pathname)
  if (!kind) return []
  return modulesForScopeKind(kind, 'sidebar')
    .map((m) => MODULE_COMPONENTS[m.id])
    .filter((C): C is ComponentType => !!C)
}

// The right-quadrant module (e.g. "Circle Quest" on a circle). Sits opposite the
// page settings in the bottom row of the panel.
function questModuleFor(pathname: string) {
  if (/^\/circles\/[^/]+/.test(pathname)) return <CircleQuestModule />
  return null
}

// Rendered by the page TEMPLATES in place of their header divider. With `asDivider`
// (the default for PageHeading), it DRAWS the hairline rule and puts the "Settings ▾"
// split inline on that rule — one line, not two — so the control reads as a split on
// the divider on every page. Fed by PageAdminProvider (no per-template prop threading).
// When the viewer has nothing to administer it still draws the bare rule (asDivider) or
// nothing (legacy callers that own their own divider).
export function PageAdminBar({ asDivider = false }: { asDivider?: boolean } = {}) {
  const { role, staffRole, webRole } = usePageAdmin()
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Collapse on route change (derived-state pattern).
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  const isStaffMember = staffRole != null
  // Two tiers: page MANAGERS (host+ / staff — each module still re-gates
  // server-side, so a host who can't manage THIS page gets empty modules) see the
  // full Settings panel; everyone else on a shareable page gets a Share panel with
  // just the QR + link. The dropdown only ever holds what the viewer can use.
  const manager = meetsAccess('host', role) || isStaffMember

  // Platform operators (web_role admin/janitor, ADR-208 — "admin and above") get the
  // page-level "Page" settings group on EVERY page: chrome / SEO / status / layout
  // surfaced on the page itself, not buried in /admin (docs/EMBEDDED-ADMIN.md inline
  // layer). The community ladder (host+) does NOT unlock this — it is staff-only.
  const isOperator = isStaff(webRole)

  const shareable = isShareable(pathname)
  // When acting AS the page's divider, always at least draw the rule; otherwise (a
  // legacy caller that owns its divider) render nothing when there is no admin.
  const bareRule = asDivider ? <div className="mb-5 border-b border-border sm:mb-6" /> : null
  if (!manager && !shareable && !isOperator) return bareRule

  const isCircle = manager && /^\/circles\/[^/]+/.test(pathname)
  const settingsModules = manager ? settingsModulesFor(pathname) : []
  const hasSettings = settingsModules.length > 0
  const questModule = manager ? questModuleFor(pathname) : null
  // Operator page-content editing (ADR-180) on configured routes — admin+ only.
  const contentModule =
    manager && (CONTENT_EDIT_ROUTES as readonly string[]).includes(pathname) && meetsAccess('admin', role)
      ? <PageContentModule />
      : null

  // Nothing to administer or share here — render nothing. Operators always have the
  // page-level Page group, so they keep the panel even on a plain (non-entity) page.
  if (!shareable && !hasSettings && !questModule && !contentModule && !isOperator) return bareRule

  // The bottom row: page settings (left) + quest / content (right). Only drawn
  // when at least one of those modules exists.
  const hasBottomRow = hasSettings || !!questModule || !!contentModule
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}${pathname}`

  // The page-settings column — the registry-selected sidebar modules for this scope,
  // stacked, under the shared "Page settings" label. Used in both the circle and the
  // generic layout below.
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

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-canvas px-1.5 py-0.5 text-xs font-semibold text-muted transition-colors hover:text-text"
    >
      {manager || isOperator ? 'Settings' : 'Share'}
      <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
    </button>
  )

  // Panel — a CONTAINED card within the content column (not edge-to-edge), with
  // generous inner padding. The page's EDIT modules come first; the QR designer +
  // share/codes sit below them. Non-managers get only the share kit.
  const panel = (
    <div
      className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      <div className="overflow-hidden">
        <div className="mt-2 space-y-5 rounded-2xl border border-border bg-surface p-4 sm:p-6">
          {hasBottomRow && isCircle && (
            <div className="space-y-6">
              {/* Circle settings — full width across the top. */}
              {settingsBlock}
              {/* Quest (2/3) + rail layout (1/3) below. */}
              <div className="gap-y-6 lg:grid lg:grid-cols-3 lg:gap-x-8">
                {questModule && <div className="min-w-0 lg:col-span-2">{questModule}</div>}
                <div className="min-w-0 lg:col-span-1">
                  <CircleRailModule />
                </div>
              </div>
            </div>
          )}

          {hasBottomRow && !isCircle && (
            <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
              {settingsBlock}
              {questModule && <div className="min-w-0">{questModule}</div>}
              {contentModule && <div className="min-w-0 lg:col-span-2">{contentModule}</div>}
            </div>
          )}

          {shareable && hasBottomRow && <hr className="border-border" />}

          {shareable && (manager
            ? <PageQrManager pathname={pathname} url={url} />
            : <PageShareKit pathname={pathname} url={url} />)}

          {/* Page-level settings (chrome / SEO / status / layout), staff-only. A
              hairline sets it apart from any entity admin / share kit above it. */}
          {isOperator && (hasBottomRow || shareable) && <hr className="border-border" />}
          {isOperator && <PageSettingsModule />}
        </div>
      </div>
    </div>
  )

  // As the page divider: the hairline rule fills the row and the "Settings ▾" split
  // sits INLINE on it (one line, not two). The panel expands below, full content width.
  if (asDivider) {
    return (
      <div className="mb-5 sm:mb-6">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          {trigger}
        </div>
        {panel}
      </div>
    )
  }

  // Legacy callers that own their own divider: the trigger sits just under it,
  // right-aligned, with no rule of its own.
  return (
    <div className="-mt-3 mb-5 sm:mb-6">
      <div className="flex justify-end">{trigger}</div>
      {panel}
    </div>
  )
}
