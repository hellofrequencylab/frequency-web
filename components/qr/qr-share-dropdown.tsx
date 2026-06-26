'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown, Share2 } from 'lucide-react'
import { PageQrManager, PageShareKit } from '@/components/qr/page-qr-manager'

// "QR & Share" — the page's share affordance, split out of PageAdminBar (D.1).
// On any shareable page it is shown to ANY signed-in role: managers get the full
// QR designer + scan activity (PageQrManager); everyone else gets the read-only
// share kit (PageShareKit). The per-role split is preserved exactly as it was
// inside the old Settings panel — only the home moved.
//
// The dropdown reuses the outside-click + Esc pattern from primary-nav.tsx's
// Dropdown: open on click, close on outside-click / Escape / navigation. Tokens
// only, no hex; copy carries no em or en dashes.

export function QrShareDropdown({
  /** Whether the viewer manages this page (host+ / staff). Managers get the QR
   *  designer; everyone else gets the read-only share kit. */
  manager,
}: {
  manager: boolean
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Collapse on route change (derived-state pattern, matching PageAdminBar).
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}${pathname}`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-canvas px-1.5 py-0.5 text-xs font-semibold text-muted transition-colors hover:text-text"
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden />
        QR &amp; Share
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="QR and Share"
          // Wide, horizontal panel: the manager designer lays out as three side-by-side regions
          // (preview + looks · design controls · share + activity), so it stays short instead of a
          // tall narrow column. Capped near the content-column width so it doesn't overhang the
          // nav, with min() keeping it inside the viewport on smaller screens.
          className="absolute right-0 top-full z-50 mt-2 w-[min(95vw,48rem)] rounded-2xl border border-border bg-surface p-4 shadow-pop sm:p-6"
        >
          {manager ? (
            <PageQrManager pathname={pathname} url={url} />
          ) : (
            <PageShareKit pathname={pathname} url={url} />
          )}
        </div>
      )}
    </div>
  )
}
