'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Share2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { PageQrManager, PageShareKit } from '@/components/qr/page-qr-manager'
import { publicShareUrl } from '@/lib/qr/public-url'
import { useShareRef } from '@/components/qr/share-ref-context'

// "QR & Share" — the page's share affordance, split out of PageAdminBar (D.1).
// On any shareable page it is shown to ANY signed-in role: managers get the full
// QR designer + scan activity (PageQrManager); everyone else gets the read-only
// share kit (PageShareKit). The per-role split is preserved exactly as it was
// inside the old Settings panel — only the home moved.
//
// The editor now opens as a CENTERED MODAL (the shared Dialog: backdrop, Esc +
// backdrop-click to close, scroll-lock, focus trap) instead of an inline
// disclosure — no chevron, no on-page expand. Tokens only, no hex; copy carries
// no em or en dashes.
//
// SECURITY: the code/link is built from publicShareUrl(origin, pathname), which
// maps an owner surface (/events/<slug>/manage, /spaces/<slug>/settings, ...) back
// to the entity's PUBLIC page, so a printed QR can never resolve to an admin route
// (see lib/qr/public-url.ts).

export function QrShareDropdown({
  /** Whether the viewer manages this page (host+ / staff). Managers get the QR
   *  designer; everyone else gets the read-only share kit. */
  manager,
}: {
  manager: boolean
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Collapse on route change (derived-state pattern, matching PageAdminBar).
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  // On a PERSON page this is the profile owner's id (set by the page's ShareRefProvider);
  // null everywhere else. It rides the share url as `?ref=` so the copied link AND the QR
  // attribute a new signup to the owner (proxy → fq_ref → applyReferralAttribution).
  const shareRef = useShareRef()
  // The PUBLIC canonical page for this route — the QR image, the copy link, and any saved
  // code all point here, never at an admin/manage/settings path. `path` stays the clean
  // canonical route; only `url` carries the referral `?ref` (person pages only — the seam
  // enforces both the person-page scope and a valid-UUID ref).
  const { path: publicPath, url } = publicShareUrl(origin, pathname, { ref: shareRef })

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-canvas px-1.5 py-0.5 text-xs font-semibold text-muted transition-colors hover:text-text"
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden />
        QR &amp; Share
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="QR and Share"
        // Wide, horizontal panel: the manager designer lays out as three side-by-side
        // regions (preview + looks · design controls · share + activity), so it stays
        // short instead of a tall narrow column.
        className="max-w-3xl"
      >
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-pop sm:p-6">
          {manager ? (
            <PageQrManager pathname={publicPath} url={url} />
          ) : (
            <PageShareKit pathname={publicPath} url={url} />
          )}
        </div>
      </Dialog>
    </>
  )
}
