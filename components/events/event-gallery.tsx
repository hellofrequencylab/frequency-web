'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

// Event gallery — a clickable thumbnail strip that opens a full-screen lightbox.
// The poster (the event's cover image) is passed FIRST, so it leads the gallery and
// is itself clickable, exactly like the rest. Pure presentation: it takes already-
// resolved public image URLs (the page resolves storage paths → URLs server-side).
//
// Rendered only when there are at least two images to browse (the lone poster already
// shows as the hero, so a one-item gallery would just repeat it).
export function EventGallery({ images }: { images: string[] }) {
  // null = closed; otherwise the index of the open image.
  const [open, setOpen] = useState<number | null>(null)

  const count = images.length
  const show = useCallback((i: number) => setOpen(((i % count) + count) % count), [count])
  const close = useCallback(() => setOpen(null), [])

  // Keyboard: Esc closes, arrows page. Bound only while the lightbox is open.
  useEffect(() => {
    if (open === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') setOpen((o) => (o === null ? o : (o + 1) % count))
      else if (e.key === 'ArrowLeft') setOpen((o) => (o === null ? o : (o - 1 + count) % count))
    }
    window.addEventListener('keydown', onKey)
    // Lock background scroll while the overlay is up.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, count, close])

  if (count < 2) return null

  return (
    <section aria-label="Event photos" className="mb-6">
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {images.map((src, i) => (
          <li key={src}>
            <button
              type="button"
              onClick={() => show(i)}
              aria-label={`View photo ${i + 1} of ${count}`}
              className="group relative block aspect-square w-full overflow-hidden rounded-xl border border-border bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-border-strong/40"
            >
              {/* Unoptimized: images come from Supabase Storage, outside the configured
                  next/image domains (same as the event cover + recap album). */}
              <Image
                src={src}
                alt=""
                fill
                sizes="(max-width: 640px) 25vw, 160px"
                unoptimized
                className="object-cover transition-transform duration-200 group-hover:scale-105"
              />
              {/* First tile is the poster — label it so its role is clear. */}
              {i === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-white">
                  Poster
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Event photo viewer"
          onClick={close}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>

          {count > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                show(open - 1)
              }}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:left-6"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* The image itself — stop propagation so clicking it doesn't close the overlay. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[88vh] w-full max-w-4xl items-center justify-center"
          >
            <Image
              src={images[open]}
              alt={`Event photo ${open + 1} of ${count}`}
              width={1600}
              height={1200}
              unoptimized
              className="max-h-[88vh] w-auto rounded-lg object-contain"
            />
          </div>

          {count > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                show(open + 1)
              }}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:right-6"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
            {open + 1} / {count}
          </span>
        </div>
      )}
    </section>
  )
}
