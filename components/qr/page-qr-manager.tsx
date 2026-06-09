'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { QrCode, Download, Copy, Check, Trash2, Palette, Link2, ExternalLink } from 'lucide-react'
import { StyleEditor } from '@/app/(main)/admin/qr/style-editor'
import {
  createPageQr,
  listPageQrCodes,
  deletePageQr,
  type PageQrCode,
} from '@/app/(main)/admin/qr/link-actions'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { DEFAULT_STYLE, type QrStyle } from '@/lib/qr/style'
import { isError } from '@/lib/action-result'

// The on-page QR studio (ADR-179). Two columns: DESIGN a QR on the left (the visual
// editor), and SHARE links + the page's GENERATED codes on the right. Each saved code
// is a real managed code (retargetable, tracked, downloadable) filed under this page's
// route; the Studio groups every page's codes into folders.
export function PageQrManager({ pathname, url }: { pathname: string; url: string }) {
  const [codes, setCodes] = useState<PageQrCode[] | null>(null)
  const [, startLoad] = useTransition()

  function reload() {
    startLoad(async () => {
      const r = await listPageQrCodes(pathname)
      setCodes(isError(r) ? [] : r.data)
    })
  }

  useEffect(() => {
    let live = true
    listPageQrCodes(pathname).then((r) => {
      if (live) setCodes(isError(r) ? [] : r.data)
    })
    return () => {
      live = false
    }
  }, [pathname])

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
      {/* LEFT — design a QR */}
      <div className="min-w-0">
        <p className="mb-3 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
          <Palette className="h-3.5 w-3.5" /> Design a QR for this page
        </p>
        <CreateForm pathname={pathname} url={url} onDone={reload} />
      </div>

      {/* RIGHT — share links + generated codes */}
      <div className="min-w-0">
        <p className="mb-3 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
          <QrCode className="h-3.5 w-3.5" /> Share &amp; generated codes
        </p>
        <ShareLinks url={url} pathname={pathname} />
        <div className="mt-4 space-y-2">
          {codes === null ? (
            <p className="text-2xs text-muted">Loading…</p>
          ) : codes.length === 0 ? (
            <p className="text-2xs text-muted">No codes yet — design one on the left to file it here.</p>
          ) : (
            codes.map((c) => <SavedCode key={c.id} code={c} url={url} onDeleted={reload} />)
          )}
        </div>
      </div>
    </div>
  )
}

// Quick share — the raw page link, no minted code.
function ShareLinks({ url, pathname }: { url: string; pathname: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="flex items-center gap-2">
      <code
        className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface-elevated/50 px-2.5 py-1.5 font-mono text-2xs text-muted"
        title={url}
      >
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs font-semibold text-text transition-colors hover:bg-surface-elevated"
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
  )
}

// A generated code: small QR icon + label, with download / copy / delete.
function SavedCode({ code, url, onDeleted }: { code: PageQrCode; url: string; onDeleted: () => void }) {
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()
  const svg = useMemo(() => renderStyledQrSvg(url, code.style, 120), [url, code.style])
  const api = `/api/qr?code=${encodeURIComponent(code.id)}`

  function copyLink() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  function remove() {
    if (!window.confirm('Delete this QR code? Printed copies will stop resolving.')) return
    start(async () => {
      await deletePageQr(code.id)
      onDeleted()
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2">
      <div
        className="h-12 w-12 shrink-0 rounded-md border border-border bg-white p-0.5 [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-text">{code.title}</p>
        <p className="text-2xs text-muted">
          {code.scan_count} scan{code.scan_count === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <a href={`${api}&format=png&download=${encodeURIComponent(code.slug)}`} title="Download PNG" className={ICON}>
          <Download className="h-3.5 w-3.5" />
        </a>
        <button type="button" onClick={copyLink} title="Copy link" className={ICON}>
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          title="Delete"
          className={`${ICON} hover:border-danger/40 hover:text-danger disabled:opacity-60`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function CreateForm({ pathname, url, onDone }: { pathname: string; url: string; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [style, setStyle] = useState<QrStyle>({ ...DEFAULT_STYLE })
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

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
      onDone()
    })
  }

  return (
    <div className="space-y-3">
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

      <StyleEditor value={style} onChange={setStyle} previewUrl={url} />

      {error && <p className="text-2xs text-danger">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-2xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        <Palette className="h-3.5 w-3.5" /> {pending ? 'Saving…' : 'Save QR'}
      </button>
    </div>
  )
}

const ICON =
  'inline-flex items-center justify-center rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-text'
