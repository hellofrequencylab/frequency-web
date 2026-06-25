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
// A RESIZABLE panel that slides out over the right-rail column on the `open-settings`
// event. By default it sits at exactly the right-rail width, so it COVERS the rail and
// nothing reflows. A grab handle on its LEFT edge widens it; the shell reads the live
// width (reported up via `onStateChange`) and sizes the rail column to match, so the
// MAIN CONTENT COMPRESSES as the drawer grows. It can never spill past the content's
// right column (it is its own pushing column, never an overlay over the body), and it
// is bounded so the body stays usable.
//
// It holds the NON-share settings: the manager/operator registry modules (Page settings,
// Circle Quest, page content) plus the operator "Page" group (Layout / SEO / Status). QR
// & Share is NOT here (it split out into the QrShareDropdown, D.1). Open + width persist
// in localStorage. Tokens only; copy carries no em or en dashes.

const STORAGE_OPEN = 'freq-settings-open'
const STORAGE_WIDTH = 'freq-settings-width'

// The rail-width floor (w-72 = 18rem = 288px): at rest the drawer is exactly this, so it
// covers the rail and nothing moves. The cap keeps the body readable when widened; ARROW
// steps the keyboard resize.
const RAIL_WIDTH = 288
const MIN_WIDTH = RAIL_WIDTH
const MAX_WIDTH = 600
const WIDTH_STEP = 24

// The shell's right side-buffer (the content flex container's lg:px-8 = 2rem). The drawer is
// painted this much WIDER than its logical width and offset right by the same amount, so its
// LEFT edge still aligns with the rail column (covering the rail / driving the center
// compression via the reported width) while its RIGHT edge sits FLUSH to the viewport edge with
// no gap. Only the paint changes — the reported width below is the logical width, so the
// shell's column sizing / compression is unchanged.
const RIGHT_BUFFER = 32

const clampWidth = (w: number) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w)))

/** What the drawer reports up so the shell can size the rail column to match (and so the
 *  center content compresses while it is open + widened). `resizing` lets the shell drop
 *  its width transition during an active drag so the column tracks the pointer 1:1. */
export interface SettingsDrawerState {
  open: boolean
  width: number
  resizing: boolean
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
  onStateChange,
}: {
  /** Reported up so the shell can size the rail column to the live drawer width (the
   *  center content compresses as it grows). The right rail itself STAYS — the drawer
   *  slides over its column. */
  onStateChange?: (state: SettingsDrawerState) => void
}) {
  const { role, staffRole, webRole } = usePageAdmin()
  const pathname = usePathname()

  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(RAIL_WIDTH)
  const [resizing, setResizing] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  // Drives the slide-in: the panel mounts translated off to the right, then settles to 0
  // on the next frame so opening reads as a slide from the side.
  const [shown, setShown] = useState(false)

  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Hydrate persisted open + width once on mount. The drawer renders closed on the server
  // (no localStorage), so this client-only sync can't mismatch the markup.
  useEffect(() => {
    const savedOpen = localStorage.getItem(STORAGE_OPEN) === '1'
    const savedWidth = Number(localStorage.getItem(STORAGE_WIDTH))
    /* eslint-disable react-hooks/set-state-in-effect */
    if (savedOpen) setOpen(true)
    if (Number.isFinite(savedWidth) && savedWidth > 0) setWidth(clampWidth(savedWidth))
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  // Persist + report state up (open / width / resizing) once hydrated.
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_OPEN, open ? '1' : '0')
    localStorage.setItem(STORAGE_WIDTH, String(width))
    onStateChange?.({ open, width, resizing })
  }, [open, width, resizing, hydrated, onStateChange])

  // Slide-in choreography: show on open (next frame), reset on close.
  useEffect(() => {
    if (!open) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setShown(false)
      return
    }
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [open])

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

  // Move focus into the panel on open (the close button); restore to body on close.
  // Guarded on `hydrated` so the open-on-mount restore doesn't steal focus on first paint.
  useEffect(() => {
    if (!hydrated) return
    if (open) {
      closeButtonRef.current?.focus()
    } else {
      document.body?.focus?.()
    }
  }, [open, hydrated])

  // ── Resize handle (pointer): drag the LEFT edge. Dragging LEFT widens (the panel grows
  // toward the body, the shell compresses the center to match). ──
  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = width
      setResizing(true)
      const onMove = (ev: PointerEvent) => setWidth(clampWidth(startW + (startX - ev.clientX)))
      const onUp = () => {
        setResizing(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [width],
  )

  // ── Resize handle (keyboard): a focusable separator. Left/Right step the width;
  // Home/End jump to the bounds (WCAG 2.1.1). ──
  const onHandleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setWidth((w) => clampWidth(w + WIDTH_STEP))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setWidth((w) => clampWidth(w - WIDTH_STEP))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setWidth(MIN_WIDTH)
    } else if (e.key === 'End') {
      e.preventDefault()
      setWidth(MAX_WIDTH)
    }
  }, [])

  // ── What this viewer can administer (the non-share half of PageAdminBar) ──
  const manager = meetsAccess('host', role) || staffRole != null
  // Platform operators (web_role admin/janitor) get the page-level "Page" group
  // on every page; the community ladder does NOT unlock it (staff only).
  const isOperator = isStaff(webRole)

  const settingsModules = manager ? settingsModulesFor(pathname) : []
  const hasSettings = settingsModules.length > 0
  const isCircle = manager && /^\/circles\/[^/]+/.test(pathname)
  const questModule = manager ? questModuleFor(pathname) : null
  // The full page-content editor (title / description / hero / CTA). ADMIN routes are
  // excluded: their Settings is trimmed to Subtitle + Layout (ADR-359), and the subtitle is
  // edited by the SubtitleEditor inside PageSettingsModule. /admin/menu is in
  // CONTENT_EDIT_ROUTES only so that subtitle save resolves — it must NOT pull in this module.
  const contentModule =
    manager &&
    !pathname.startsWith('/admin') &&
    (CONTENT_EDIT_ROUTES as readonly string[]).includes(pathname) &&
    meetsAccess('admin', role) ? (
      <PageContentModule />
    ) : null

  // The generic "Page" group (Basics title/header, Status & visibility, SEO, Layout) is for
  // operator CONTENT pages. An entity-detail page (a Circle, Hub, Event, channel, profile…) owns
  // its identity through its OWN settings block above (name, cover, status…), so the generic
  // Basics/Status/SEO there is just noise — drop it on every entity scope. (Entity PROFILES at
  // /spaces/* are a different, module-driven scope and keep their Layout editor.)
  const isEntityScope = scopeKindForPath(pathname) !== null
  const showPageSettings = isOperator && !isEntityScope

  const hasContent = hasSettings || !!questModule || !!contentModule || showPageSettings

  // Nothing to manage here: render nothing (no trigger lives in this component —
  // PageAdminBar dispatches `open-settings`; with no content the drawer stays closed,
  // and the shell keeps the rail at its normal width).
  if (!hasContent) {
    return null
  }

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

  // Closed: render nothing — the rail shows normally underneath. The shell mounts this
  // inside the rail-column wrapper, so an open drawer slides over that column.
  if (!open) return null

  return (
    <aside
      role="dialog"
      aria-label="Page settings"
      // Pinned FLUSH to the viewport's right edge — no gap. The rail-column wrapper this is
      // absolutely positioned inside sits one shell side-buffer (the content flex container's
      // lg:px-8 = 2rem = RIGHT_BUFFER) in from the viewport edge, so a plain right-0 floats the
      // drawer that far off the edge. We overhang the buffer: paint the panel RIGHT_BUFFER wider
      // and offset it right by the same amount, so its LEFT edge still aligns with the rail
      // column (covering the rail) while its RIGHT edge meets the viewport edge. The slide-in
      // translateX uses the painted width so it still settles flush.
      style={{
        width: width + RIGHT_BUFFER,
        right: -RIGHT_BUFFER,
        transform: shown ? 'translateX(0)' : 'translateX(100%)',
      }}
      // No max-w cap here: the painted width intentionally overhangs the rail column by
      // RIGHT_BUFFER to reach the viewport edge (max-w-full would resolve against the column and
      // clamp the overhang back off). The width is already bounded by MAX_WIDTH + the buffer,
      // which stays well within any lg viewport.
      className={`absolute inset-y-0 z-50 hidden flex-col border-l border-border bg-surface shadow-pop lg:flex ${
        resizing ? '' : 'transition-transform duration-200 ease-out motion-reduce:transition-none'
      }`}
    >
      {/* Grab handle — the LEFT edge resize affordance. Drag (or Arrow/Home/End) to widen;
          the shell compresses the center to match. A thin rail with a centered grip. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize settings"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onHandlePointerDown}
        onKeyDown={onHandleKeyDown}
        className="group absolute inset-y-0 left-0 z-10 flex w-3 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center focus:outline-none"
      >
        <span className="h-10 w-1 rounded-full bg-border-strong transition-colors group-hover:bg-primary group-focus-visible:bg-primary motion-reduce:transition-none" />
      </div>

      {/* The panel cover is full column height (covers the whole rail), but its CONTENT
          sticks to the viewport so it stays in reach on a long page. */}
      <div className="sticky top-14 flex max-h-[calc(100vh-3.5rem)] flex-col">
        {/* Header — title + close. */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border pl-5 pr-3">
          <p className="text-sm font-bold text-text">Settings</p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close settings"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text motion-reduce:transition-none"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Body — scrolls. The registry modules first (Page settings, Circle Quest / rail,
            page content), then the operator "Page" group (Layout / SEO / Status). */}
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

            {/* The operator page-globals group, set apart by a hairline. Suppressed on entity
                scopes (a Circle, Event, profile…), whose own settings block above already owns
                the page's identity. */}
            {showPageSettings && (hasSettings || !!questModule || !!contentModule) && (
              <hr className="border-border" />
            )}
            {showPageSettings && <PageSettingsModule hideBasics={!!contentModule} />}
          </div>
        </div>
      </div>
    </aside>
  )
}
