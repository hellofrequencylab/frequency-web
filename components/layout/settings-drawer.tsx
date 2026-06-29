'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useSettingsPanel, useIsDesktop } from '@/components/layout/settings-panel'

// ── The settings drawer (ADR-128 PageAdminDock, rebuilt at the shell level) ────
// A RESIZABLE panel that slides out over the right-rail column on the `open-settings`
// event (DESKTOP / lg+ only — the mobile equivalent is MobileSettingsSheet). By default it
// sits at exactly the right-rail width, so it COVERS the rail and nothing reflows. A grab
// handle on its LEFT edge widens it; the shell reads the live width (reported via
// `onStateChange`) and sizes the rail column to match, so the MAIN CONTENT COMPRESSES as
// the drawer grows. It can never spill past the content's right column, and it is bounded
// so the body stays usable.
//
// Its CONTENT comes from `useSettingsPanel()` (shared with MobileSettingsSheet) — the
// manager/operator registry modules plus the operator "Page" group. QR & Share is NOT here
// (it split into QrShareDropdown). Open + width persist in localStorage. Tokens only.

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
// LEFT edge still aligns with the rail column while its RIGHT edge sits FLUSH to the viewport
// edge with no gap. Only the paint changes — the reported width is the logical width.
const RIGHT_BUFFER = 32

const clampWidth = (w: number) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w)))

/** What the drawer reports up so the shell can size the rail column to match. */
export interface SettingsDrawerState {
  open: boolean
  width: number
  resizing: boolean
}

export function SettingsDrawer({
  onStateChange,
}: {
  /** Reported up so the shell can size the rail column to the live drawer width. */
  onStateChange?: (state: SettingsDrawerState) => void
}) {
  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(RAIL_WIDTH)
  const [resizing, setResizing] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  // Drives the slide-in: the panel mounts translated off to the right, then settles to 0
  // on the next frame so opening reads as a slide from the side.
  const [shown, setShown] = useState(false)

  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const isDesktop = useIsDesktop()
  const { hasContent, content } = useSettingsPanel()

  // Hydrate persisted open + width once on mount.
  useEffect(() => {
    const savedOpen = localStorage.getItem(STORAGE_OPEN) === '1'
    const savedWidth = Number(localStorage.getItem(STORAGE_WIDTH))
    /* eslint-disable react-hooks/set-state-in-effect */
    if (savedOpen) setOpen(true)
    if (Number.isFinite(savedWidth) && savedWidth > 0) setWidth(clampWidth(savedWidth))
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  // Persist + report state up once hydrated.
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

  // Trigger seam (D.6): open on the `open-settings` window event. A second dispatch toggles it.
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
  useEffect(() => {
    if (!hydrated) return
    if (open) {
      closeButtonRef.current?.focus()
    } else {
      document.body?.focus?.()
    }
  }, [open, hydrated])

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

  // The mobile equivalent (MobileSettingsSheet) owns < lg, so this slide-over only mounts its
  // content on desktop — never a hidden double-mount of the settings modules on a phone.
  if (!isDesktop) return null
  // Nothing to manage here, or closed: render nothing — the rail shows normally underneath.
  if (!hasContent) return null
  if (!open) return null

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

        {/* Body — scrolls. The shared settings content. */}
        <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-5">{content}</div>
      </div>
    </aside>
  )
}
