'use client'

import { useState } from 'react'
import { QrCode, ChevronDown, Contact } from 'lucide-react'
import { PageShareKit } from '@/components/qr/page-qr-manager'

// The owner's "QR & Links" disclosure — a small client island that opens a panel
// INTO THE BODY (not a popover) below the hero, holding the member's profile QR +
// share link (PageShareKit) and the vCard download. The server page stays a Server
// Component; this is the only interactive bit of the hero's owner actions.
export function ProfileShareDisclosure({
  url,
  pathname,
  vcardHref,
}: {
  /** Absolute profile URL the QR encodes. */
  url: string
  /** The page's route for scoping/share (e.g. /people/handle). */
  pathname: string
  /** vCard download href, when the member enabled a contact card. */
  vcardHref: string | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="w-full">
      {/* The trigger reads as a single line of text sitting ON the rule that closes
          the hero — the divider fills the space to its left, the link to its right. */}
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" aria-hidden />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-text"
        >
          <QrCode className="h-3.5 w-3.5" />
          QR &amp; Links
          <ChevronDown className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <PageShareKit url={url} pathname={pathname} />
          {vcardHref && (
            <a
              href={vcardHref}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-2xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <Contact className="h-3.5 w-3.5" />
              Download contact card
            </a>
          )}
        </div>
      )}
    </div>
  )
}
