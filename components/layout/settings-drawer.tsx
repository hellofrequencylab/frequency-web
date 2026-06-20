'use client'

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
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
// A right-edge panel that opens LEFTWARD and holds the NON-share settings: the
// manager/operator registry modules (Page settings, Circle Quest, page content)
// plus the operator "Page" group (Layout / SEO / Status). QR & Share is NOT here
// any more — it split out into the QrShareDropdown (D.1). Open/close + a drag
// handle on the LEFT edge to widen, both persisted in localStorage
// (`freq-settings-open` / `freq-settings-width`). The drawer opens on the
// `open-settings` window event (D.6, mirroring `open-capture`).
//
// The shell owns the right-rail hide + the mini-left-rail swap; this component
// reports its open + widened state up via onOpenChange / onWidenChange so the
// shell can react (D.3 / D.4). Tokens only; copy carries no em or en dashes.

const STORAGE_OPEN = 'freq-settings-open'
const STORAGE_WIDTH = 'freq-settings-width'

// Width bounds (px). MIN matches the global right rail (w-72 = 18rem = 288px) so
// the drawer can sit exactly in that slot; MAX leaves the page readable. WIDEN is
// the threshold past which the shell collapses the left rail to its mini render.
const MIN_WIDTH = 288
const MAX_WIDTH = 560
const DEFAULT_WIDTH = 360
export const SETTINGS_WIDEN_THRESHOLD = 420

function clampWidth(w: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)))
}

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

export function SettingsDrawer({
  onOpenChange,
  onWidenChange,
}: {
  /** Reported up so the shell can hide the right rail while open (D.3). */
  onOpenChange?: (open: boolean) => void
  /** Reported up so the shell can collapse the left rail to its mini render once
   *  the drawer is widened past the threshold (D.4). */
  onWidenChange?: (widened: boolean) => void
}) {
  const { role, staffRole, webRole } = usePageAdmin()
  const pathname = usePathname()

  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [hydrated, setHydrated] = useState(false)

  // Hydrate persisted open + width once on mount. The drawer renders closed on the
  // server (no localStorage), so this client-only sync can't mismatch the markup.
  useEffect(() => {
    const savedOpen = localStorage.getItem(STORAGE_OPEN) === '1'
    const savedWidth = Number(localStorage.getItem(STORAGE_WIDTH))
    /* eslint-disable react-hooks/set-state-in-effect */
    if (Number.isFinite(savedWidth) && savedWidth > 0) setWidth(clampWidth(savedWidth))
    if (savedOpen) setOpen(true)
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  // Persist + report open.
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_OPEN, open ? '1' : '0')
    onOpenChange?.(open)
  }, [open, hydrated, onOpenChange])

  // Persist + report widened (past the threshold).
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_WIDTH, String(width))
    onWidenChange?.(open && width >= SETTINGS_WIDEN_THRESHOLD)
  }, [width, open, hydrated, onWidenChange])

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

  // ── Left-edge drag-resize (pointer events) ───────────────────────────────
  // A `dragging` state drives a single effect that attaches the window listeners only
  // while a drag is in flight; the effect's cleanup detaches them. The drag origin
  // (pointer X + width at grab) is captured in refs on pointer-down so the move handler
  // reads stable values without re-subscribing.
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      startX.current = e.clientX
      startWidth.current = width
      setDragging(true)
    },
    [width],
  )

  useEffect(() => {
    if (!dragging) return
    function onMove(e: PointerEvent) {
      // Dragging LEFT (decreasing clientX) widens the panel — it grows toward the
      // page; dragging right narrows it.
      setWidth(clampWidth(startWidth.current + (startX.current - e.clientX)))
    }
    function onUp() {
      setDragging(false)
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      document.body.style.removeProperty('user-select')
      document.body.style.removeProperty('cursor')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging])

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

  return (
    <>
      {/* The panel — a right-edge, fixed, full-height column that opens leftward.
          It sits under the header (top-14) and above the mobile chrome; on desktop
          (lg+) it occupies the right slot the rail vacated, bounded by the content
          column. Width is drag-driven + persisted. */}
      <aside
        role="dialog"
        aria-label="Page settings"
        aria-hidden={!open}
        style={{ width: open ? width : 0 }}
        className={`fixed inset-y-0 right-0 top-14 z-30 hidden flex-col border-l border-border bg-surface shadow-pop transition-[width,opacity] duration-300 ease-out lg:flex ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {/* Left-edge drag handle — pointer-drag to widen. A thin grab strip with a
            visible grip on hover, sitting on the panel's left border. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize settings"
          onPointerDown={startDrag}
          className="group absolute inset-y-0 left-0 z-10 flex w-2 cursor-col-resize touch-none items-center justify-center"
        >
          <span className="h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-border-strong" aria-hidden />
        </div>

        {/* Header — title + close. */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border pl-4 pr-3">
          <p className="text-sm font-bold text-text">Settings</p>
          <button
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
