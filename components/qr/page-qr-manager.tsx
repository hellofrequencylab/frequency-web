'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { QrCode, Plus, Download, Copy, Check, Trash2, Palette } from 'lucide-react'
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

// The on-page QR folder (ADR-179). On a shareable page's Settings panel an operator
// designs + saves QR codes filed under this page's route — each one is a real managed
// code (retargetable, tracked, downloadable) that points back at the page. The Studio
// then groups every page's codes into folders. This replaces the transient
// /api/qr?text=… preview with a managed, persistent set.
export function PageQrManager({ pathname, url }: { pathname: string; url: string }) {
  const [codes, setCodes] = useState<PageQrCode[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [, startLoad] = useTransition()

  function reload() {
    startLoad(async () => {
      const r = await listPageQrCodes(pathname)
      setCodes(isError(r) ? [] : r.data)
    })
  }

  // Load this page's codes once (and on path change).
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
    <div className="min-w-0">
      <p className="mb-3 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
        <QrCode className="h-3.5 w-3.5" /> QR codes for this page
      </p>

      {codes === null ? (
        <p className="text-2xs text-muted">Loading…</p>
      ) : codes.length === 0 && !creating ? (
        <p className="text-2xs text-muted">
          No codes yet — design one below. It’s a managed code you can retarget, track, and reprint.
        </p>
      ) : (
        <div className="space-y-3">
          {codes.map((c) => (
            <SavedCode key={c.id} code={c} url={url} onDeleted={reload} />
          ))}
        </div>
      )}

      {creating ? (
        <CreateForm
          pathname={pathname}
          url={url}
          onDone={() => {
            setCreating(false)
            reload()
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs font-semibold text-text transition-colors hover:bg-surface-elevated"
        >
          <Plus className="h-3.5 w-3.5" /> Create QR for this page
        </button>
      )}
    </div>
  )
}

function SavedCode({
  code,
  url,
  onDeleted,
}: {
  code: PageQrCode
  url: string
  onDeleted: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()
  const svg = useMemo(() => renderStyledQrSvg(url, code.style, 160), [url, code.style])
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
    <div className="flex gap-3 rounded-xl border border-border bg-surface p-2.5">
      <div
        className="h-20 w-20 shrink-0 rounded-lg border border-border bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-text">{code.title}</p>
        <p className="mt-0.5 text-2xs text-muted">
          {code.scan_count} scan{code.scan_count === 1 ? '' : 's'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <a href={`${api}&format=png&download=${encodeURIComponent(code.slug)}`} className={CHIP}>
            <Download className="h-3 w-3" /> PNG
          </a>
          <a href={`${api}&format=svg&download=${encodeURIComponent(code.slug)}`} className={CHIP}>
            <Download className="h-3 w-3" /> SVG
          </a>
          <button type="button" onClick={copyLink} className={CHIP}>
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Link'}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-2xs text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-60"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateForm({
  pathname,
  url,
  onDone,
  onCancel,
}: {
  pathname: string
  url: string
  onDone: () => void
  onCancel: () => void
}) {
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
      onDone()
    })
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface p-3">
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

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-2xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          <Palette className="h-3.5 w-3.5" /> {pending ? 'Saving…' : 'Save QR'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-2xs font-semibold text-muted transition-colors hover:text-text"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

const CHIP =
  'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-2xs text-muted transition-colors hover:bg-surface-elevated hover:text-text'
