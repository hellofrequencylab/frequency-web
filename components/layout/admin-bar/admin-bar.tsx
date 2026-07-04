'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { useSettingsPanel, useIsDesktop } from '@/components/layout/settings-panel'
import { AdminBarBody } from '@/components/layout/admin-bar/admin-bar-body'
import { OPEN_ADMIN_BAR, type OpenAdminBarDetail } from '@/components/admin/open-admin-bar'

// ── The standardized admin bar (docs/ADMIN-RAIL.md Phase 2) ────────────────────
// ONE themed chrome element that merges the desktop settings slide-over (formerly
// SettingsDrawer) and the mobile full-screen sheet (formerly MobileSettingsSheet) into a
// single component. A shared core owns the open state, the stored trigger `detail`, the
// `open-admin-bar` + legacy `open-settings` listeners, the shared settings BODY
// (useSettingsPanel) and the `hasContent` guard; a `useIsDesktop()` branch then renders:
//   • DESKTOP (lg+): a RESIZABLE `<aside>` that slides out over the right-rail column. By
//     default it sits at exactly the rail width, so it COVERS the rail and nothing reflows.
//     A grab handle on its LEFT edge widens it; the shell reads the live width (reported via
//     `onStateChange`) and sizes the rail column to match, so the MAIN CONTENT COMPRESSES as
//     the bar grows. Open + width persist in localStorage.
//   • MOBILE (< lg): a full-screen sheet rendered through `createPortal(sheet, document.body)`
//     so it escapes the `hidden lg:flex` rail column it is mounted inside and covers the
//     viewport. Same content, same `open-admin-bar` / `open-settings` triggers.
//
// Its CONTENT comes from `useSettingsPanel()` — the manager/operator registry modules plus the
// operator "Page" group. QR & Share is NOT here (it split into QrShareDropdown). Tokens only.

const STORAGE_OPEN = 'freq-settings-open'
const STORAGE_WIDTH = 'freq-settings-width'

// The rail-width floor (w-72 = 18rem = 288px): at rest the bar is exactly this, so it
// covers the rail and nothing moves. The cap keeps the body readable when widened; ARROW
// steps the keyboard resize.
const RAIL_WIDTH = 288
const MIN_WIDTH = RAIL_WIDTH
const MAX_WIDTH = 600
const WIDTH_STEP = 24

// The shell's right side-buffer (the content flex container's lg:px-8 = 2rem). The bar is
// painted this much WIDER than its logical width and offset right by the same amount, so its
// LEFT edge still aligns with the rail column while its RIGHT edge sits FLUSH to the viewport
// edge with no gap. Only the paint changes — the reported width is the logical width.
const RIGHT_BUFFER = 32

const clampWidth = (w: number) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w)))

/** What the admin bar reports up so the shell can size the rail column to match. */
export interface AdminBarState {
  open: boolean
  width: number
  resizing: boolean
}

/** Migration shim: the old name for {@link AdminBarState}. Kept during the Phase-2 rollout so
 *  any lingering import resolves. Prefer `AdminBarState`. */
export type SettingsDrawerState = AdminBarState

export function AdminBar({
  onStateChange,
}: {
  /** Reported up so the shell can size the rail column to the live desktop bar width. */
  onStateChange?: (state: AdminBarState) => void
}) {
  const [open, setOpen] = useState(false)
  // The pre-scoped detail a typed `open-admin-bar` dispatch carried (scope + caps). Undefined on the
  // legacy bare `open-settings` path, where the panel resolves exactly as it did before.
  const [detail, setDetail] = useState<OpenAdminBarDetail | undefined>(undefined)
  const [width, setWidth] = useState(RAIL_WIDTH)
  const [resizing, setResizing] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  // Drives the desktop slide-in: the panel mounts translated off to the right, then settles to 0
  // on the next frame so opening reads as a slide from the side.
  const [shown, setShown] = useState(false)

  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const pathname = usePathname()
  const isDesktop = useIsDesktop()
  const model = useSettingsPanel(detail)
  const { hasContent } = model
  // Resets the drill screen + query on route/scope change (the desktop bar persists across nav).
  const resetKey = `${pathname}::${detail?.scope?.kind ?? ''}`

  // ── Shared trigger seam. TWO listeners during the migration (docs/ADMIN-RAIL.md): ──
  //   • legacy bare `open-settings` (D.6) — TOGGLES as it always has and clears any pre-scoped detail,
  //     so anything still dispatching it behaves exactly as before.
  //   • typed `open-admin-bar` — stores the dispatch's { scope, caps } and OPENS (never toggles), so a
  //     deep-link from an "Edit" button always lands open, pointed at that scope.
  useEffect(() => {
    function onLegacy() {
      setDetail(undefined)
      setOpen((o) => !o)
    }
    window.addEventListener('open-settings', onLegacy)
    return () => window.removeEventListener('open-settings', onLegacy)
  }, [])
  useEffect(() => {
    function onTyped(e: Event) {
      setDetail((e as CustomEvent<OpenAdminBarDetail>).detail)
      setOpen(true)
    }
    window.addEventListener(OPEN_ADMIN_BAR, onTyped)
    return () => window.removeEventListener(OPEN_ADMIN_BAR, onTyped)
  }, [])

  // Close on Escape while open (both surfaces).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // ── Mobile-only: close when the route changes (navigating away closes the sheet — mobile
  // expectation). The desktop slide-over deliberately persists across navigation. ──
  useEffect(() => {
    if (isDesktop) return
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setOpen(false)
  }, [pathname, isDesktop])

  // ── Desktop-only: hydrate persisted open + width once (guarded to the desktop branch, as the
  // localStorage state belongs to the slide-over; the mobile sheet always starts closed). ──
  useEffect(() => {
    if (!isDesktop || hydrated) return
    const savedOpen = localStorage.getItem(STORAGE_OPEN) === '1'
    const savedWidth = Number(localStorage.getItem(STORAGE_WIDTH))
    /* eslint-disable react-hooks/set-state-in-effect */
    if (savedOpen) setOpen(true)
    if (Number.isFinite(savedWidth) && savedWidth > 0) setWidth(clampWidth(savedWidth))
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isDesktop, hydrated])

  // ── Desktop-only: persist + report state up once hydrated. ──
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_OPEN, open ? '1' : '0')
    localStorage.setItem(STORAGE_WIDTH, String(width))
    onStateChange?.({ open, width, resizing })
  }, [open, width, resizing, hydrated, onStateChange])

  // Desktop slide-in choreography: show on open (next frame), reset on close.
  useEffect(() => {
    if (!open) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setShown(false)
      return
    }
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  // Desktop-only: move focus into the panel on open (the close button); restore to body on close.
  useEffect(() => {
    if (!isDesktop || !hydrated) return
    if (open) {
      closeButtonRef.current?.focus()
    } else {
      document.body?.focus?.()
    }
  }, [open, hydrated, isDesktop])

  // ── Resize handle (pointer): drag the LEFT edge. Dragging LEFT widens. ──
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

  // ── Resize handle (keyboard): Left/Right step the width; Home/End jump to the bounds. ──
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

  // Nothing to manage here, or closed: render nothing — the rail shows normally underneath.
  if (!hasContent) return null
  if (!open) return null

  // ── DESKTOP (lg+): the resizable slide-over over the right-rail column. ──
  if (isDesktop) {
    return (
      <aside
        role="dialog"
        aria-label="Page settings"
        style={{
          width: width + RIGHT_BUFFER,
          right: -RIGHT_BUFFER,
          transform: shown ? 'translateX(0)' : 'translateX(100%)',
        }}
        className={`absolute inset-y-0 z-50 hidden flex-col border-l border-border bg-surface shadow-pop lg:flex ${
          resizing ? '' : 'transition-transform duration-200 ease-out motion-reduce:transition-none'
        }`}
      >
        {/* Grab handle — the LEFT edge resize affordance. */}
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

        {/* The panel cover is full column height, but its CONTENT sticks to the viewport. */}
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] flex max-h-[calc(100vh-3.5rem)] flex-col">
          {/* Close — floats over the top-right of the sticky search so the search bar IS the top of the
              rail, with no empty header band above it (ADR-516: kill the transparent gap). */}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close settings"
            className="absolute right-3 top-3.5 z-30 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-muted transition-colors hover:bg-surface-elevated hover:text-text motion-reduce:transition-none"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>

          {/* Body — scrolls. The sticky search inside is the top of the rail. */}
          <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <AdminBarBody key={resetKey} model={model} />
          </div>
        </div>
      </aside>
    )
  }

  // ── MOBILE (< lg): the full-screen sheet, PORTALED to <body> so it escapes the
  // `hidden lg:flex` rail column this component mounts inside and covers the viewport. ──
  if (typeof document === 'undefined') return null
  const sheet = (
    <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Page settings">
      {/* Backdrop — tap to dismiss. */}
      <button
        type="button"
        aria-label="Close settings"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/40"
      />
      {/* Sheet — full-width on a phone (w-full), a right-side sheet on a tablet (max-w-md). */}
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-pop">
        {/* Close — floats over the sticky search's top-right, so the search is the top of the sheet with
            no empty header band above it (ADR-516: kill the transparent gap). */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close settings"
          className="absolute right-3 top-4 z-30 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-muted transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <AdminBarBody key={resetKey} model={model} />
        </div>
      </div>
    </div>
  )
  return createPortal(sheet, document.body)
}
