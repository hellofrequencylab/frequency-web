'use client'

import { useEffect, type ReactNode } from 'react'

// Distraction-free overlay for the composer. Lifts the box over a dimmed,
// blurred feed — same modal grammar as the Vera lightbox (fixed, ESC + backdrop
// to leave, body scroll locked). The composer renders its own chrome inside the
// slot; this shell only owns the backdrop and centering.
export function ComposeLightbox({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compose a post"
        className="mt-[6vh] w-full max-w-2xl outline-none motion-safe:animate-[slideUp_0.3s_ease-out]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
