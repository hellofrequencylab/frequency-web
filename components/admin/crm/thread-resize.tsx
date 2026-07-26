'use client'

// THREAD PULL HANDLE — lets the operator drag the conversation reader taller (or shorter) and keeps the
// choice in localStorage. Pointer events only, no dependency. Two pieces share one module store (the
// column-selector pattern: useSyncExternalStore, server snapshot = default) so the server components can
// compose them: `ResizableReader` (the reader container, owns the height) and `ThreadResizeHandle` (the
// grab bar at the bottom edge of the thread scroll area). Double-click resets.

import { useRef, useSyncExternalStore, type ReactNode } from 'react'

const STORAGE_KEY = 'crm-thread-height'
const MIN_HEIGHT = 360
const MAX_HEIGHT = 2400

function clampHeight(n: number): number {
  return Math.min(Math.max(n, MIN_HEIGHT), MAX_HEIGHT)
}

// ── Module store ────────────────────────────────────────────────────────────
// One localStorage-backed height for the workspace. null = default (viewport-bound CSS).

let clientHeight: number | null | undefined // undefined = not read from storage yet
const listeners = new Set<() => void>()

function getSnapshot(): number | null {
  if (clientHeight === undefined) {
    clientHeight = null
    try {
      const saved = parseInt(window.localStorage.getItem(STORAGE_KEY) ?? '', 10)
      if (Number.isFinite(saved)) clientHeight = clampHeight(saved)
    } catch {
      // localStorage unavailable (private mode) — keep the default.
    }
  }
  return clientHeight
}

function getServerSnapshot(): number | null {
  return null
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Set the live height (drag) or clear it (reset); `persist` writes the choice through to storage. */
function setStoredHeight(next: number | null, persist: boolean): void {
  clientHeight = next
  if (persist) {
    try {
      if (next === null) window.localStorage.removeItem(STORAGE_KEY)
      else window.localStorage.setItem(STORAGE_KEY, String(Math.round(next)))
    } catch {
      // Best-effort persistence.
    }
  }
  listeners.forEach((l) => l())
}

// ── Components ──────────────────────────────────────────────────────────────

export function ResizableReader({ children, className = '' }: { children: ReactNode; className?: string }) {
  const height = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return (
    <div
      data-thread-reader
      className={`${className} ${height === null ? 'lg:h-[calc(100dvh-13rem)]' : ''}`}
      style={height !== null ? { height, minHeight: height } : undefined}
    >
      {children}
    </div>
  )
}

/** The grab bar. Sits at the bottom edge of the thread scroll area; drag to resize, double-click to reset. */
export function ThreadResizeHandle() {
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Drag to resize the conversation area. Double-click to reset."
      title="Drag to resize. Double-click to reset."
      className="flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center border-t border-border hover:bg-surface-elevated"
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        const reader = e.currentTarget.closest<HTMLElement>('[data-thread-reader]')
        dragRef.current = {
          startY: e.clientY,
          startHeight: reader?.getBoundingClientRect().height ?? MIN_HEIGHT,
        }
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current
        if (!drag || !e.currentTarget.hasPointerCapture(e.pointerId)) return
        setStoredHeight(clampHeight(drag.startHeight + (e.clientY - drag.startY)), false)
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        if (!dragRef.current) return
        dragRef.current = null
        setStoredHeight(getSnapshot(), true)
      }}
      onPointerCancel={() => {
        dragRef.current = null
        setStoredHeight(getSnapshot(), true)
      }}
      onDoubleClick={() => {
        dragRef.current = null
        setStoredHeight(null, true)
      }}
    >
      <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
    </div>
  )
}
