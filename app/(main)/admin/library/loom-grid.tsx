'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Copy, Check, ExternalLink, Archive, Trash2, ImageOff, Download } from 'lucide-react'
import type { LibraryGalleryItem } from '@/lib/library/store'
import { Illustration, illustrationNames, type IllustrationName } from '@/components/marketing/illustrations'
import { sanitizeSvg } from '@/lib/library/svg-sanitize'
import {
  downloadElementSvg,
  downloadElementPng,
  downloadImageUrl,
  extForMime,
} from '@/lib/library/export-svg'
import { updateLibraryAssetMeta, archiveLibraryAsset, deleteLibraryAsset } from './actions'

function human(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** The illustration-registry name for an `element` asset, if valid. */
function elementName(asset: LibraryGalleryItem): IllustrationName | null {
  const n = asset.config?.name
  return typeof n === 'string' && (illustrationNames as readonly string[]).includes(n)
    ? (n as IllustrationName)
    : null
}

/** A Vera-generated card stores its SVG string in config.svg. Re-validate before render. */
function safeElementSvg(asset: LibraryGalleryItem): string | null {
  const raw = asset.config?.svg
  if (typeof raw !== 'string' || !raw) return null
  const c = sanitizeSvg(raw)
  return c.ok ? c.svg : null
}

/** Renders an asset's visual: a Vera-drawn SVG, a registry element via <Illustration>, a
 *  file via <img>, or a placeholder. `fit` picks cover (grid tiles) vs contain (preview). */
function Thumb({ asset, fit }: { asset: LibraryGalleryItem; fit: 'cover' | 'contain' }) {
  if (asset.kind === 'element') {
    const raw = safeElementSvg(asset)
    if (raw) {
      return (
        <div
          className="flex h-full w-full items-center justify-center p-4 [&>svg]:max-h-full [&>svg]:w-auto"
          // Sanitized at save AND re-validated by safeElementSvg above before this render.
          dangerouslySetInnerHTML={{ __html: raw }}
        />
      )
    }
    const el = elementName(asset)
    if (el) {
      return (
        <div className="flex h-full w-full items-center justify-center p-4">
          <Illustration name={el} className="max-h-full w-auto" />
        </div>
      )
    }
  }
  if (asset.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.url}
        alt={asset.alt || asset.title}
        loading="lazy"
        className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
      />
    )
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-subtle">
      <ImageOff className="h-6 w-6" aria-hidden />
    </div>
  )
}

// The Loom Studio grid + detail drawer. Click a card to open the drawer, edit its metadata,
// copy its URL, open/download it, or archive/delete it. Mutations run through the janitor-gated
// server actions, then refresh the server component.
export function LoomGrid({ assets }: { assets: LibraryGalleryItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const selected = assets.find((a) => a.id === openId) ?? null

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {assets.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setOpenId(a.id)}
            className="group overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-sm transition-shadow hover:shadow-pop"
          >
            <span className="block aspect-[4/3] overflow-hidden bg-surface-elevated transition-transform duration-200 group-hover:scale-[1.02]">
              <Thumb asset={a} fit="cover" />
            </span>
            <span className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate text-sm text-text" title={a.title}>
                {a.title}
              </span>
              <span className="shrink-0 text-xs text-subtle">{human(a.bytes)}</span>
            </span>
          </button>
        ))}
      </div>

      {selected && <DetailDrawer asset={selected} onClose={() => setOpenId(null)} />}
    </>
  )
}

function DetailDrawer({ asset, onClose }: { asset: LibraryGalleryItem; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [title, setTitle] = useState(asset.title)
  const [alt, setAlt] = useState(asset.alt ?? '')
  const [category, setCategory] = useState(asset.category ?? '')
  const [tags, setTags] = useState(asset.tags.join(', '))

  function save() {
    setErr(null)
    start(async () => {
      const res = await updateLibraryAssetMeta(asset.id, { title, alt, category, tags })
      if ('error' in res) setErr(res.error)
      else {
        router.refresh()
        onClose()
      }
    })
  }

  function archive() {
    setErr(null)
    start(async () => {
      const res = await archiveLibraryAsset(asset.id)
      if ('error' in res) setErr(res.error)
      else {
        router.refresh()
        onClose()
      }
    })
  }

  function remove() {
    setErr(null)
    start(async () => {
      const res = await deleteLibraryAsset(asset.id)
      if ('error' in res) setErr(res.error)
      else {
        router.refresh()
        onClose()
      }
    })
  }

  async function copyUrl() {
    if (!asset.url) return
    try {
      await navigator.clipboard.writeText(asset.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setErr('Could not copy to clipboard.')
    }
  }

  const previewRef = useRef<HTMLDivElement>(null)
  const isElement = asset.kind === 'element' && (!!elementName(asset) || !!safeElementSvg(asset))

  function previewSvg(): SVGSVGElement | null {
    return previewRef.current?.querySelector('svg') ?? null
  }
  function exportSvg() {
    const svg = previewSvg()
    if (svg) downloadElementSvg(svg, `${asset.slug || 'card'}.svg`)
  }
  function exportPng() {
    const svg = previewSvg()
    if (svg) void downloadElementPng(svg, `${asset.slug || 'card'}.png`)
  }
  function downloadFile() {
    if (asset.url) void downloadImageUrl(asset.url, `${asset.slug || 'image'}.${extForMime(asset.mime)}`)
  }

  const inputCls = 'w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm'
  const chipCls =
    'inline-flex items-center gap-1.5 rounded-2xl border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-elevated'

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Asset details">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slat/40"
      />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-lg uppercase text-text">Asset</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-subtle hover:bg-surface-elevated" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div
            ref={previewRef}
            className="flex h-64 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-elevated"
          >
            <Thumb asset={asset} fit="contain" />
          </div>

          <p className="text-xs text-subtle">
            {asset.kind}
            {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''}
            {asset.bytes ? ` · ${human(asset.bytes)}` : ''}
            {asset.status !== 'approved' ? ` · ${asset.status}` : ''}
          </p>

          <div className="flex flex-wrap gap-2">
            {asset.url && (
              <button
                type="button"
                onClick={copyUrl}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-elevated"
              >
                {copied ? <Check className="h-4 w-4 text-signal" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy URL'}
              </button>
            )}
            {asset.url && (
              <a
                href={asset.url}
                target="_blank"
                rel="noreferrer"
                className={chipCls}
              >
                <ExternalLink className="h-4 w-4" /> Open
              </a>
            )}
            {asset.url && (
              <button type="button" onClick={downloadFile} className={chipCls}>
                <Download className="h-4 w-4" /> Download
              </button>
            )}
            {isElement && (
              <>
                <button type="button" onClick={exportSvg} className={chipCls}>
                  <Download className="h-4 w-4" /> SVG
                </button>
                <button type="button" onClick={exportPng} className={chipCls}>
                  <Download className="h-4 w-4" /> PNG
                </button>
              </>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">Title</span>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">Alt text</span>
            <input className={inputCls} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">Category</span>
            <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">Tags</span>
            <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" />
          </label>

          {err && <p className="text-sm text-danger">{err}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary-hover disabled:opacity-70"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={archive}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-border px-3 py-2 text-sm text-muted hover:bg-surface-elevated disabled:opacity-70"
            >
              <Archive className="h-4 w-4" /> Archive
            </button>
            <button
              type="button"
              onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}
              disabled={pending}
              className="ml-auto inline-flex items-center gap-1.5 rounded-2xl border border-danger px-3 py-2 text-sm text-danger hover:bg-danger/10 disabled:opacity-70"
            >
              <Trash2 className="h-4 w-4" /> {confirmDelete ? 'Confirm delete' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
