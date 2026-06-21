'use client'

import { useEffect, useRef, useState, type ComponentType } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
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

// ── The settings drawer (ADR-128 PageAdminDock, rebuilt at the shell level) ────
// A panel CONFINED to the right-rail column: it overlays the right-rail slot at
// exactly the rail's width and never extends past the content's right edge. It holds
// the NON-share settings — the manager/operator registry modules (Page settings,
// Circle Quest, page content) plus the operator "Page" group (Layout / SEO / Status).
// QR & Share is NOT here any more — it split out into the QrShareDropdown (D.1).
// Open/close is persisted in localStorage (`freq-settings-open`). The drawer opens on
// the `open-settings` window event (D.6, mirroring `open-capture`).
//
// Owner revision (2026-06-20): the drawer is FIXED to the right-rail width — no
// drag-to-widen, no past-the-rail growth — and the LEFT and RIGHT rails BOTH stay put
// while it is open (the old hide-the-rail / collapse-left-rail behavior is gone). The
// component reports only its open state up via onOpenChange so the shell can render the
// drawer in the right-rail slot over the rail. Tokens only; copy carries no em or en dashes.

const STORAGE_OPEN = 'freq-settings-open'

// The drawer is exactly the global right rail's width (w-72 = 18rem = 288px) so it sits
// cleanly in that column. Fixed — there is no resize.
const RAIL_WIDTH = 288

// Which scope kind an entity-detail path represents — the bridge from a URL to the
// admin-module registry. Mirrors PageAdminBar's resolver (the share half moved to
// the QR & Share dropdown; the settings half lives here).
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

// The sidebar ("manage") modules for this path, resolved from the registry. Each
// module self-resolves from the pathname and re-gates server-side, so selection
// here is by scope kind; an unauthorized viewer simply sees an empty module.
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

export function SettingsDrawer() {
  const { role, staffRole, webRole } = usePageAdmin()
  const pathname = usePathname()

  const [open, setOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Focus management (WCAG 2.4.3): the close button receives focus when the drawer
  // opens; on close we drop focus back to the body (no trigger lives here, per the
  // header note, so there is nothing else to restore to).
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Hydrate persisted open once on mount. The drawer renders closed on the server (no
  // localStorage), so this client-only sync can't mismatch the markup.
  useEffect(() => {
    const savedOpen = localStorage.getItem(STORAGE_OPEN) === '1'
    /* eslint-disable react-hooks/set-state-in-effect */
    if (savedOpen) setOpen(true)
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  // Persist open.
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_OPEN, open ? '1' : '0')
  }, [open, hydrated])

  // Trigger seam (D.6): open on the `open-settings` window event, mirroring
  // `open-capture`. A second dispatch toggles it (matches the inline trigger).
  useEffect(() => {
    function onOpen() {
      setOpen((o) => !o)
    }
    window.addEventListener('open-settings', onOpen)
    return () => window.removeEventListener('open-settings', onOpen)
  }, [])

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Move focus into the panel on open (the close button), and restore it to the body
  // on close. Guarded on `hydrated` so the open-on-mount restore from localStorage
  // doesn't steal focus on first paint; the trigger lives in another component, so
  // body is the sensible fallback and the optional chaining never crashes.
  useEffect(() => {
    if (!hydrated) return
    if (open) {
      closeButtonRef.current?.focus()
    } else {
      document.body?.focus?.()
    }
  }, [open, hydrated])

  // ── What this viewer can administer (the non-share half of PageAdminBar) ──
  const manager = meetsAccess('host', role) || staffRole != null
  // Platform operators (web_role admin/janitor) get the page-level "Page" group
  // on every page; the community ladder does NOT unlock it (staff only).
  const isOperator = isStaff(webRole)

  const settingsModules = manager ? settingsModulesFor(pathname) : []
  const hasSettings = settingsModules.length > 0
  const isCircle = manager && /^\/circles\/[^/]+/.test(pathname)
  const questModule = manager ? questModuleFor(pathname) : null
  const contentModule =
    manager &&
    (CONTENT_EDIT_ROUTES as readonly string[]).includes(pathname) &&
    meetsAccess('admin', role) ? (
      <PageContentModule />
    ) : null

  const hasContent = hasSettings || !!questModule || !!contentModule || isOperator

  // Nothing to manage here: render nothing (no trigger lives in this component —
  // PageAdminBar dispatches `open-settings`; with no content the drawer stays
  // empty/closed). Reporting closed keeps the shell's right rail visible.
  if (!hasContent) {
    return null
  }

  // The page-settings column — the registry-selected sidebar modules for this
  // scope, stacked under the shared "Page settings" label.
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

  // When there's content but the drawer is closed, render nothing — the right rail
  // shows normally underneath. The shell mounts this inside the right-rail slot, so an
  // open drawer overlays exactly that column (the left + right rails BOTH stay put).
  if (!open) return null

  return (
    <>
      {/* The panel — confined to the right-rail column. It fills the rail slot it is
          mounted in (absolute inset-0), so it is EXACTLY the rail's width (w-72 = 18rem)
          and can never extend past the content's right edge. No resize, no widen: a
          fixed-width settings column overlaying the rail. Desktop only (lg+); the rail
          itself is lg-only. */}
      <aside
        role="dialog"
        aria-label="Page settings"
        style={{ width: RAIL_WIDTH }}
        className="absolute inset-y-0 right-0 z-30 hidden max-w-full flex-col border-l border-border bg-surface shadow-pop lg:flex"
      >
        {/* Header — title + close. */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border pl-4 pr-3">
          <p className="text-sm font-bold text-text">Settings</p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close settings"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Body — scrolls. Holds the page/entity settings, grouped (D.5): the
            registry modules first (Page settings, Circle Quest / rail, page
            content), then the operator "Page" group (Layout / SEO / Status). */}
        <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="space-y-5">
            {isCircle && (
              <div className="space-y-6">
                {settingsBlock}
                {questModule && <div className="min-w-0">{questModule}</div>}
                <div className="min-w-0">
                  <CircleRailModule />
                </div>
              </div>
            )}

            {!isCircle && (
              <div className="space-y-6">
                {settingsBlock}
                {questModule && <div className="min-w-0">{questModule}</div>}
                {contentModule && <div className="min-w-0">{contentModule}</div>}
              </div>
            )}

            {/* The operator page-globals group, set apart by a hairline. */}
            {isOperator && (hasSettings || !!questModule || !!contentModule) && (
              <hr className="border-border" />
            )}
            {isOperator && <PageSettingsModule />}
          </div>
        </div>
      </aside>
    </>
  )
}
