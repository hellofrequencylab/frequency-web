'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { GalleryItem } from '@/lib/spotlight/blocks/schema'

// The interactive half of the gallery block. render.tsx is a Server Component, so the
// clickable square thumbnails + the full-image lightbox live here behind 'use client'.
// Each thumbnail is cropped to the member's per-image focus point + zoom; the lightbox
// shows the FULL uncropped image. Mirrors the event gallery's lightbox (keyboard: Esc
// closes, ← / → page) with a focus-trap-lite so Tab cycles the controls while open.
//
// Inputs are already validated (lib/spotlight/blocks/validate.ts): assetPath is a public
// bucket path, focus/zoom are clamped. The base URL is rebuilt here, never member-supplied.

function thumbStyle(item: GalleryItem): CSSProperties {
  const zoom = item.zoom ?? 100
  return {
    objectPosition: `${item.focusX ?? 50}% ${item.focusY ?? 50}%`,
    transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
  }
}

export function GalleryLightbox({
  items, publicBase, cardStyle,
}: {
  items: GalleryItem[]
  publicBase: string
  cardStyle?: CSSProperties
}) {
  // null = closed; otherwise the index of the open image.
  const [open, setOpen] = useState<number | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const count = items.length
  const show = useCallback((i: number) => setOpen(((i % count) + count) % count), [count])
  const close = useCallback(() => setOpen(null), [])

  // Keyboard: Esc closes, arrows page, Tab is trapped to the overlay's controls.
  // Bound only while the lightbox is open; restores body scroll on close.
  useEffect(() => {
    if (open === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') setOpen((o) => (o === null ? o : (o + 1) % count))
      else if (e.key === 'ArrowLeft') setOpen((o) => (o === null ? o : (o - 1 + count) % count))
      else if (e.key === 'Tab') {
        // Focus-trap-lite: keep focus inside the overlay by parking it on Close.
        e.preventDefault()
        closeRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, count, close])

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => show(i)}
            aria-label={item.alt || `View image ${i + 1} of ${count}`}
            className="group relative aspect-square overflow-hidden rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-border-strong/40"
            style={cardStyle}
          >
            <Image
              src={`${publicBase}${item.assetPath}`}
              alt={item.alt}
              width={320}
              height={320}
              unoptimized
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              style={thumbStyle(item)}
            />
          </button>
        ))}
      </div>

      {open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image viewer"
          onClick={close}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas/90 p-4 backdrop-blur-sm"
        >
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-surface/80 p-2 text-text shadow-sm transition-colors hover:bg-surface focus:outline-none focus:ring-2 focus:ring-border-strong/40"
          >
            <X className="h-5 w-5" />
          </button>

          {count > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); show(open - 1) }}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-surface/80 p-2 text-text shadow-sm transition-colors hover:bg-surface focus:outline-none focus:ring-2 focus:ring-border-strong/40 sm:left-6"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* The full, uncropped image — stop propagation so a click on it doesn't close. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[88vh] w-full max-w-3xl items-center justify-center"
          >
            <Image
              src={`${publicBase}${items[open].assetPath}`}
              alt={items[open].alt || `Image ${open + 1} of ${count}`}
              width={1600}
              height={1600}
              unoptimized
              className="max-h-[88vh] w-auto rounded-lg object-contain"
            />
          </div>

          {count > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); show(open + 1) }}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-surface/80 p-2 text-text shadow-sm transition-colors hover:bg-surface focus:outline-none focus:ring-2 focus:ring-border-strong/40 sm:right-6"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {count > 1 && (
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-surface/80 px-3 py-1 text-xs font-medium text-text shadow-sm">
              {open + 1} / {count}
            </span>
          )}
        </div>
      )}
    </>
  )
}
