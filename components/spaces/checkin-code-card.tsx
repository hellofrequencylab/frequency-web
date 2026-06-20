'use client'

import { useState } from 'react'
import { Check, Download, Link2, QrCode } from 'lucide-react'

// THE CHECK-IN QR CARD (ENTITY-SPACES-BUILD §C, Phase 2). A client card that DISPLAYS a check-in
// node's QR (pre-rendered server-side via the existing lib/qr helpers, passed in as `svg`) and offers
// copy-the-link + download. It does NOT render or own any QR logic itself: the inline SVG arrives
// from the server (renderQrSvg(nodeUrl(...))) and the downloads stream from the shared /api/qr
// endpoint, the same path every other QR surface uses (the member code card, the entry-point share).
// This keeps lib/qr/* untouched: the card is a thin display + download shell.
//
// Copy obeys CONTENT-VOICE: plain, no narrated feelings, no em/en dashes.

export function CheckinCodeCard({ svg, link }: { svg: string; link: string }) {
  const [copied, setCopied] = useState(false)
  const qrApi = `/api/qr?text=${encodeURIComponent(link.replace(/^https?:\/\/[^/]+/, ''))}`

  function copy() {
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated'

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-text">
        <QrCode className="h-4 w-4 text-primary-strong" aria-hidden /> Check-in code
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        Print it at your door. Every scan records a check-in on the roster below.
      </p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-border bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
          aria-label="Check-in QR code"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface-elevated/50 px-2.5 py-1.5 font-mono text-xs text-muted"
              title={link}
            >
              {link}
            </code>
            <button type="button" onClick={copy} className={btn}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" aria-hidden />
              ) : (
                <Link2 className="h-3.5 w-3.5" aria-hidden />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`${qrApi}&format=png&size=1024&download=check-in-code`} className={btn}>
              <Download className="h-3.5 w-3.5" aria-hidden /> PNG
            </a>
            <a href={`${qrApi}&format=svg&download=check-in-code`} className={btn}>
              <Download className="h-3.5 w-3.5" aria-hidden /> SVG
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
