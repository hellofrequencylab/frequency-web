'use client'

import { useMemo, useState } from 'react'
import { QrCode, Link2, Check, ExternalLink, Contact } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { DEFAULT_STYLE, withCenterLogo } from '@/lib/qr/style'
import { publicShareUrl } from '@/lib/qr/public-url'
import { cn } from '@/lib/utils'

// THE SPACE "Connect" AFFORDANCE (root-cause fix for the reported bug). The Space header used to point
// its QR/Connect button at `/codes` — the VIEWER's personal code hub, which renders the VIEWER's own
// code + avatar. So opening the QR on a business Space ("Justice Massage") showed the scanner's personal
// code, not the Space's. This control encodes the SPACE's OWN public page (`/spaces/<slug>`) and centers
// the SPACE's brand logo (never the viewer's avatar), so a scan lands on the Space and the printed mark
// carries the Space's identity.
//
// ATTRIBUTION: the share url carries the SHARER's own id as `?ref=` (publicShareUrl now attaches a ref on
// any entity share, not just people), so a new visitor who follows the link/scan is credited to whoever
// shared it at signup (proxy drops fq_ref → applyReferralAttribution). Anonymous / self shares are no-ops.
//
// SAVE CONTACT: when the Space offers a vCard, a "Save contact" link points at `/spaces/<slug>/vcard`.
//
// Shown to ANY viewer (this is the public "connect with the business" action). VOICE (CONTENT-VOICE §10):
// plain labels, no narrated feelings, no em/en dashes. Tokens only, no hex.
export function SpaceShareButton({
  slug,
  brandName,
  brandLogoUrl,
  sharerProfileId,
  hasContactCard,
  className,
  iconOnly = false,
}: {
  slug: string
  brandName: string
  brandLogoUrl: string | null
  /** The viewer's profile id — rides the share url as `?ref=` so a signup is credited to the sharer.
   *  Null for a signed-out viewer (no ref attached). */
  sharerProfileId: string | null
  /** Whether the Space exposes a "Save contact" vCard (always true today; kept explicit + fail-soft). */
  hasContactCard: boolean
  className?: string
  /** Compact icon-only trigger (the mobile action band); otherwise the labelled "QR" button. */
  iconOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const { path, url } = publicShareUrl(origin, `/spaces/${slug}`, { ref: sharerProfileId })

  // The SPACE's brand logo centered in the code (never the viewer's avatar). Render-time only.
  const svg = useMemo(
    () => renderStyledQrSvg(url, withCenterLogo({ ...DEFAULT_STYLE }, brandLogoUrl), 240),
    [url, brandLogoUrl],
  )

  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Connect with ${brandName}`}
        title="Connect"
        className={className}
      >
        {!iconOnly && 'QR'}
        <QrCode className={iconOnly ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel={`Connect with ${brandName}`} className="max-w-md">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-pop sm:p-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="shrink-0">
              <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
                <QrCode className="h-3.5 w-3.5" /> Scan to open
              </p>
              <div
                aria-label={`QR code for ${brandName}`}
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
                  {copied ? 'Copied' : 'Link'}
                </button>
                <a
                  href={path}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in a new tab"
                  className="inline-flex shrink-0 items-center rounded-lg border border-border bg-surface p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              {hasContactCard && (
                <a
                  href={`/spaces/${slug}/vcard`}
                  download={`${slug}.vcf`}
                  className={cn(
                    'inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs font-semibold text-text transition-colors hover:bg-surface-elevated',
                  )}
                >
                  <Contact className="h-3.5 w-3.5" /> Save contact
                </a>
              )}
              <p className="text-2xs text-subtle">Anyone with the link or the code lands on {brandName}.</p>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  )
}
