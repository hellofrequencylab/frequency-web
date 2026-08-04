'use client'

import { useMemo, useState } from 'react'
import { QrCode, Link2, Check, ExternalLink, Download } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { DEFAULT_STYLE } from '@/lib/qr/style'
import { publicShareUrl } from '@/lib/qr/public-url'
import {
  inlineQrStyleLogo,
  downloadQrSvgString,
  downloadQrSvgStringAsPng,
} from '@/lib/qr/client-download'

// The listing "QR & Link" affordance (replaces the old Settings gear on the detail page). It encodes
// the listing's OWN public URL so a scan/link lands directly on this listing. Modeled on
// components/spaces/space-share-button.tsx (same Dialog + QR renderer + publicShareUrl). Shown to any
// viewer. VOICE (CONTENT-VOICE §10): plain labels, no narrated feelings, no em/en dashes; tokens only.
export function ListingShareButton({
  path,
  title,
  sharerProfileId,
  className,
}: {
  /** The listing's public app path, e.g. "/classifieds/<id>". The QR + link encode this exact page. */
  path: string
  title: string
  /** The viewer's profile id — rides the share url as ?ref= so a signup is credited to the sharer. */
  sharerProfileId: string | null
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const { path: sharePath, url } = publicShareUrl(origin, path, { ref: sharerProfileId })

  const svg = useMemo(() => renderStyledQrSvg(url, { ...DEFAULT_STYLE }, 240), [url])

  // QR file downloads: re-render at print size with the logo INLINED (a data URL), so the .svg is
  // self-contained anywhere and the PNG raster carries the logo (an SVG-as-image never fetches
  // external resources). PNG at 1024 prints crisply on a flyer.
  async function downloadQr(format: 'png' | 'svg') {
    const style = await inlineQrStyleLogo({ ...DEFAULT_STYLE })
    const big = renderStyledQrSvg(url, style, 1024)
    if (format === 'svg') downloadQrSvgString(big, 'listing-qr')
    else await downloadQrSvgStringAsPng(big, 'listing-qr', 1024)
  }

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
        aria-label="QR and link"
        title="QR and link"
        className={
          className ??
          'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text'
        }
      >
        <QrCode className="h-4 w-4" aria-hidden />
        QR &amp; Link
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel={`QR and link for ${title}`} className="max-w-md">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-pop sm:p-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="shrink-0">
              <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">
                <QrCode className="h-3.5 w-3.5" /> Scan to open
              </p>
              <div
                aria-label={`QR code for ${title}`}
                className="mx-auto aspect-square w-40 rounded-xl border border-border bg-white p-2 lift-1 [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />

              {/* Take the code with you: PNG for flyers and socials, SVG for print at any size. */}
              <div className="mt-2 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void downloadQr('png')}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-2xs font-semibold text-text transition-colors hover:bg-surface-elevated"
                >
                  <Download className="h-3 w-3" /> PNG
                </button>
                <button
                  type="button"
                  onClick={() => void downloadQr('svg')}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-2xs font-semibold text-text transition-colors hover:bg-surface-elevated"
                >
                  <Download className="h-3 w-3" /> SVG
                </button>
              </div>            </div>
            <div className="w-full min-w-0 space-y-3">
              <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">
                <Link2 className="h-3.5 w-3.5" /> Share link
              </p>
              <code className="block truncate rounded-lg border border-border bg-surface-elevated/50 px-2.5 py-1.5 font-mono text-2xs text-muted" title={url}>
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
              <p className="text-2xs text-muted">Anyone with the link or the code lands on this listing.</p>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  )
}
