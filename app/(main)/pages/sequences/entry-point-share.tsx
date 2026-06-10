'use client'

import { useEffect, useState } from 'react'
import { Link2, Check, Download, ExternalLink, QrCode, ChevronDown, ChevronUp } from 'lucide-react'

type Mode = 'splash' | 'induction'

// Per-sequence share kit: pick the INCOMING POINT (the polished splash page, or
// straight into the induction), then copy the shareable link or download the QR
// for whichever you picked. Both QR variants are pre-rendered server-side (same
// path as the rest of the QR surfaces) and swapped here with zero round-trips; the
// downloads stream from /api/qr (signed-in, same-site-link guarded). The choice is
// remembered per browser so the card opens where you left it. DB-built versions
// have no public splash page, so they omit splashPath/splashQr and the kit locks
// to the induction link.
export function EntryPointShare({
  slug,
  audience,
  splashPath,
  inductionPath,
  splashQr,
  inductionQr,
  siteOrigin,
}: {
  slug: string
  audience: string
  /** Omit for sequences without a public splash page (DB-built versions). */
  splashPath?: string
  inductionPath: string
  /** Pre-rendered inline QR SVGs (server-side renderQrSvg). */
  splashQr?: string
  inductionQr: string
  /** Canonical site origin (lib/site.ts SITE_URL) — what the QR also encodes. */
  siteOrigin: string
}) {
  const hasSplash = !!splashPath && !!splashQr
  const [mode, setMode] = useState<Mode>(hasSplash ? 'splash' : 'induction')
  const [copied, setCopied] = useState(false)
  // The QR + admin options stay COLLAPSED on open — the card leads with the splash
  // preview, not a wall of controls. Closed = a one-line share menu (copy the link);
  // expanded = the admin options (incoming-point toggle + QR variants + downloads).
  const [expanded, setExpanded] = useState(false)

  // Remember the chosen incoming point per sequence (this browser only). Restore
  // after mount, deferred a frame so SSR + first client render stay 'splash' (no
  // hydration mismatch) and we don't setState synchronously inside the effect.
  const storeKey = `fq_beta_entry_${slug}`
  useEffect(() => {
    if (!hasSplash) return // induction-only: nothing to restore
    const saved = localStorage.getItem(storeKey)
    if (saved !== 'splash' && saved !== 'induction') return
    const id = requestAnimationFrame(() => setMode(saved))
    return () => cancelAnimationFrame(id)
  }, [storeKey, hasSplash])

  function pick(next: Mode) {
    setMode(next)
    try { localStorage.setItem(storeKey, next) } catch { /* private mode — fine */ }
  }

  const path = mode === 'splash' && hasSplash ? splashPath! : inductionPath
  const shareUrl = `${siteOrigin}${path}`
  const qr = mode === 'splash' && hasSplash ? splashQr! : inductionQr
  const qrApi = `/api/qr?text=${encodeURIComponent(path)}`
  const fileName = `beta-${slug}-${mode}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      const el = document.createElement('textarea')
      el.value = shareUrl
      document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => pick(m)}
      aria-pressed={mode === m}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
        mode === m ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  )

  const btn = 'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated'

  // Collapsed (default): a one-line share menu — the link + copy, and a prompt to
  // reveal the QR & admin options.
  if (!expanded) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-elevated/40 px-3 py-2">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={shareUrl}>
          {shareUrl}
        </code>
        <button type="button" onClick={copy} className={btn} title={`Copy ${shareUrl}`}>
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className={`${btn} text-primary-strong hover:text-primary-strong`}
        >
          <QrCode className="h-3.5 w-3.5" /> QR &amp; options <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  // Expanded: the admin options — incoming-point toggle, the live QR, and downloads.
  return (
    <div className="rounded-xl border border-border bg-surface-elevated/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Entry point · share &amp; QR</p>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded
          className="inline-flex items-center gap-1 text-2xs font-semibold text-muted transition-colors hover:text-text"
        >
          Collapse <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
      {/* QR for the active incoming point */}
      <div
        className="flex h-[160px] w-[160px] shrink-0 items-center justify-center self-center rounded-xl bg-white p-2 ring-1 ring-border [&>svg]:h-full [&>svg]:w-full"
        aria-label={`QR code for ${audience} (${mode === 'splash' ? 'splash page' : 'induction'})`}
        dangerouslySetInnerHTML={{ __html: qr }}
      />

      {/* Controls */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {hasSplash ? (
          <div>
            <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Incoming point</p>
            <div className="inline-flex rounded-lg border border-border bg-surface-elevated p-0.5">
              {tab('splash', 'Splash page')}
              {tab('induction', 'Skip to induction')}
            </div>
            <p className="mt-1.5 text-2xs leading-snug text-subtle">
              {mode === 'splash'
                ? 'Lands on the audience splash, then into the induction.'
                : 'Drops straight into the voiced induction, no splash.'}
            </p>
          </div>
        ) : (
          <p className="text-2xs leading-snug text-subtle">
            Drops straight into the voiced induction. The link and QR are safe to share and print.
          </p>
        )}

        {/* Shareable link */}
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-muted">
            {shareUrl}
          </code>
          <button type="button" onClick={copy} className={btn} title={`Copy ${shareUrl}`}>
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>

        {/* QR downloads + open */}
        <div className="flex flex-wrap gap-2">
          <a href={`${qrApi}&format=png&size=1024&download=${fileName}`} className={btn}>
            <Download className="h-3.5 w-3.5" /> QR PNG
          </a>
          <a href={`${qrApi}&format=svg&download=${fileName}`} className={btn}>
            <Download className="h-3.5 w-3.5" /> QR SVG
          </a>
          <a href={path} target="_blank" rel="noreferrer" className={btn}>
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </a>
        </div>
      </div>
      </div>
    </div>
  )
}
