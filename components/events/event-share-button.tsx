'use client'

import { useMemo, useState } from 'react'
import { QrCode, Link2, Check, ExternalLink, Share2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { DEFAULT_STYLE } from '@/lib/qr/style'
import { publicShareUrl } from '@/lib/qr/public-url'

// The event "QR & Share" affordance — the header control that lets any viewer send an event on.
// It encodes the event's OWN public page (`/events/<slug>`) so a scan or a copied link lands right
// on the event, and it opens the phone's native share sheet where one exists (the mobile point of
// this control). Modeled on components/marketplace/listing-share-button.tsx and
// components/spaces/space-share-button.tsx (same Dialog + QR renderer + publicShareUrl seam).
//
// ATTRIBUTION: the share url carries the SHARER's own id as `?ref=` (publicShareUrl attaches it for
// any public entity share), so a new visitor who follows the link/scan is credited to whoever shared
// it at signup. Anonymous / self shares are no-ops.
//
// Shown to ANY viewer, signed in or not (this is the public "share this event" action). VOICE
// (CONTENT-VOICE §10): plain labels, no narrated feelings, no em/en dashes. Tokens only, no hex.
export function EventShareButton({
  slug,
  title,
  sharerProfileId,
  className,
}: {
  slug: string
  title: string
  /** The viewer's profile id — rides the share url as `?ref=` so a signup is credited to the sharer.
   *  Null for a signed-out viewer (no ref attached). */
  sharerProfileId: string | null
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  // Feature-detect the native share sheet once, lazily. The share panel lives inside a Dialog that
  // renders nothing until it is opened by a click, so this is only ever read on the client (never in
  // the server HTML) — no hydration mismatch — and the button appears only where the OS provides one.
  const [canNativeShare] = useState(
    () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
  )

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const { path: sharePath, url } = publicShareUrl(origin, `/events/${slug}`, { ref: sharerProfileId })

  const svg = useMemo(() => renderStyledQrSvg(url, { ...DEFAULT_STYLE }, 240), [url])

  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function nativeShare() {
    navigator.share?.({ title, url }).catch(() => {})
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Share ${title}`}
        title="QR and share"
        className={
          className ??
          'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated'
        }
      >
        <QrCode className="h-4 w-4 text-subtle" aria-hidden />
        QR &amp; Share
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel={`QR and share for ${title}`} className="max-w-md">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-pop sm:p-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="shrink-0">
              <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
                <QrCode className="h-3.5 w-3.5" /> Scan to open
              </p>
              <div
                aria-label={`QR code for ${title}`}
                className="mx-auto aspect-square w-40 rounded-xl border border-border bg-white p-2 shadow-sm [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
            <div className="w-full min-w-0 space-y-3">
              <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
                <Link2 className="h-3.5 w-3.5" /> Share link
              </p>
              <code
                className="block truncate rounded-lg border border-border bg-surface-elevated/50 px-2.5 py-1.5 font-mono text-2xs text-muted"
                title={url}
              >
                {url}
              </code>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs font-semibold text-text transition-colors hover:bg-surface-elevated"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <a
                  href={sharePath}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in a new tab"
                  className="inline-flex shrink-0 items-center rounded-lg border border-border bg-surface p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              {canNativeShare && (
                <button
                  type="button"
                  onClick={nativeShare}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-2xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  <Share2 className="h-3.5 w-3.5" /> Share
                </button>
              )}
              <p className="text-2xs text-subtle">Anyone with the link or the code lands on this event.</p>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  )
}
