'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Link2, Check, ExternalLink, Archive, Palette } from 'lucide-react'
import { StyleEditor } from '@/app/(main)/admin/qr/style-editor'
import { createPageQr } from '@/app/(main)/admin/qr/link-actions'
import { DEFAULT_STYLE, type QrStyle } from '@/lib/qr/style'
import { isError } from '@/lib/action-result'

// The on-page QR creator (ADR-179) — the COMPACT variant that lives in a page's
// Settings panel. The creator (title + a trimmed visual editor) takes the left 2/3;
// the share link sits in the right 1/3, in line with the title. Every saved code is
// a real managed code filed under this page's route; the full list + retired codes
// live in QR Studio (the "Archived codes" link), so we don't repeat them here.
export function PageQrManager({ pathname, url }: { pathname: string; url: string }) {
  const [title, setTitle] = useState('')
  const [style, setStyle] = useState<QrStyle>({ ...DEFAULT_STYLE })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  // QR Studio, scoped to this page's folder (its archive of generated + retired codes).
  const archiveHref = `/admin/qr?folder=${encodeURIComponent(pathname)}`

  function save() {
    const t = title.trim() || `QR — ${pathname}`
    start(async () => {
      const r = await createPageQr({ pagePath: pathname, targetUrl: url, title: t, style })
      if (isError(r)) {
        setError(r.error)
        return
      }
      setTitle('')
      setStyle({ ...DEFAULT_STYLE })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    })
  }

  return (
    <div className="grid gap-x-8 gap-y-5 lg:grid-cols-3">
      {/* LEFT 2/3 — the creator */}
      <div className="space-y-4 lg:col-span-2">
        <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
          <Palette className="h-3.5 w-3.5" /> Design a QR for this page
        </p>

        <label className="block">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Title</span>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setError(null)
            }}
            placeholder="e.g. Flyer — front desk"
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-xs text-text"
          />
        </label>

        <StyleEditor
          value={style}
          onChange={setStyle}
          previewUrl={url}
          compact
          presetsFooter={
            <Link
              href={archiveHref}
              className="inline-flex items-center gap-1 text-2xs font-medium text-subtle transition-colors hover:text-text"
            >
              <Archive className="h-3 w-3" /> Archived codes
            </Link>
          }
        />

        {error && <p className="text-2xs text-danger">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-2xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {saved ? <Check className="h-3.5 w-3.5" /> : <Palette className="h-3.5 w-3.5" />}
          {pending ? 'Saving…' : saved ? 'Saved' : 'Save QR'}
        </button>
      </div>

      {/* RIGHT 1/3 — share, aligned to the title row */}
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
          <Link2 className="h-3.5 w-3.5" /> Share code
        </p>
        <ShareCode url={url} pathname={pathname} />
      </div>
    </div>
  )
}

// The page's raw share link — copy or open, no minted code needed.
function ShareCode({ url, pathname }: { url: string; pathname: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="space-y-2">
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
          href={pathname}
          target="_blank"
          rel="noreferrer"
          title="Open in a new tab"
          className="inline-flex shrink-0 items-center rounded-lg border border-border bg-surface p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}
