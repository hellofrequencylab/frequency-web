'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserCircle, Pencil, Trash2, Download, Palette, EyeOff, Eye, Printer } from 'lucide-react'
import { StyleEditor } from './style-editor'
import { NfcWriter } from './nfc-writer'
import { updateMarketingCodeAdmin, setMarketingActive, deleteMarketingCodeAdmin } from './marketing-actions'
import type { QrStyle } from '@/lib/qr/style'

// Admin "Marketing codes" category — every member's funnel code, so an operator
// can oversee, restyle, pause, or retire them. Members still self-manage on /codes.
export interface MarketingCodeAdmin {
  id: string
  title: string
  slug: string
  url: string
  handle: string
  displayName: string
  targetLabel: string
  scans: number
  active: boolean
  svg: string
  style: QrStyle
}

export function MarketingCodesAdmin({ codes }: { codes: MarketingCodeAdmin[] }) {
  if (codes.length === 0) {
    return (
      <p className="py-4 text-sm text-muted">
        No marketing codes yet. Crew members create these on their own codes page to promote a
        circle or event.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {codes.map((c) => (
        <MarketingCard key={c.id} code={c} />
      ))}
    </div>
  )
}

function MarketingCard({ code }: { code: MarketingCodeAdmin }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(code.title)
  const [style, setStyle] = useState<QrStyle>(code.style)
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const api = `/api/qr?code=${encodeURIComponent(code.id)}`

  function save() {
    start(async () => {
      const r = await updateMarketingCodeAdmin(code.id, { title, style })
      if (!('error' in r)) {
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
        router.refresh()
      }
    })
  }

  function toggleActive() {
    start(async () => {
      await setMarketingActive(code.id, !code.active)
      router.refresh()
    })
  }

  function remove() {
    if (!confirm('Delete this member’s marketing code? Its scan history goes too.')) return
    start(async () => {
      await deleteMarketingCodeAdmin(code.id)
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
      <div className="flex gap-3">
        <div
          className="h-20 w-20 shrink-0 rounded-lg border border-border bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: code.svg }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-bold text-text">{code.title}</h3>
            {!code.active && (
              <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-3xs font-medium text-muted">
                Paused
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted">→ {code.targetLabel}</p>
          <p className="flex items-center gap-1 truncate text-xs text-subtle">
            <UserCircle className="h-3 w-3 shrink-0" /> {code.displayName || `@${code.handle}`}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {code.scans} scan{code.scans === 1 ? '' : 's'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={`${api}&format=png&download=${encodeURIComponent(code.slug)}`} className={DL}>
              <Download className="h-3 w-3" /> PNG
            </a>
            <a href={`${api}&format=svg&download=${encodeURIComponent(code.slug)}`} className={DL}>
              <Download className="h-3 w-3" /> SVG
            </a>
            <NfcWriter url={code.url} className={DL} />
            <a href={`/print/qr?code=${encodeURIComponent(code.id)}`} target="_blank" rel="noreferrer" className={DL}>
              <Printer className="h-3 w-3" /> Print
            </a>
            <button onClick={() => setEditing((v) => !v)} className={DL}>
              <Pencil className="h-3 w-3" /> {editing ? 'Close' : 'Edit'}
            </button>
            <button onClick={toggleActive} disabled={pending} className={DL}>
              {code.active ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {code.active ? 'Pause' : 'Resume'}
            </button>
            <button
              onClick={remove}
              disabled={pending}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:text-danger disabled:opacity-60"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-subtle">Code name</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
            />
          </label>
          <StyleEditor value={style} onChange={setStyle} previewUrl={code.url} />
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              <Palette className="h-3.5 w-3.5" /> {pending ? 'Saving…' : 'Save changes'}
            </button>
            {saved && <span className="text-xs text-success">Saved.</span>}
          </div>
        </div>
      )}
    </div>
  )
}

const DL =
  'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-elevated hover:text-text'
