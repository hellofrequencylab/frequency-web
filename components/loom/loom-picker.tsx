'use client'

// The universal Loom image picker popup (one popup for every image upload). It opens on the caller's
// PERSONAL Loom ("My uploads" = everything they ever uploaded, in any context) and lets them switch to
// any Space they run (a per-space category of that Space's shared assets). Within a scope they can
// browse Images, Elements (AI-created), or filter by Tag; upload new images (click-multi OR drag and
// drop) into the current scope; and pick one, which returns its URL to the caller.
//
// Presentational shell over the gated server actions in lib/loom/picker-actions.ts — every read/write
// re-authorizes server-side, and uploads run service-role (so they never hit the browser-session RLS
// trap). Drop it in anywhere: it resolves the caller's scopes itself, so the host needs no config.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Dialog } from '@/components/ui/dialog'
import {
  Upload, Loader2, ImageIcon, Sparkles, Tag as TagIcon, Building2, User, Check, X, Search,
} from 'lucide-react'
import { loomScopes, loomImages, uploadLoomImage, type LoomScope } from '@/lib/loom/picker-actions'
import type { LoomPickAsset } from '@/lib/library/store'

type View = 'images' | 'elements' | 'tags'

export function LoomPicker({
  open,
  onClose,
  onSelect,
  onSelectMany,
  multiple = false,
  title = 'Choose an image',
}: {
  open: boolean
  onClose: () => void
  /** Single-select: called with the chosen image's public URL; the picker closes itself after. */
  onSelect?: (url: string) => void
  /** Multi-select (with `multiple`): called with all chosen URLs when the user confirms. */
  onSelectMany?: (urls: string[]) => void
  /** Let the user pick several images at once (a confirm bar replaces click-to-close). For galleries. */
  multiple?: boolean
  title?: string
}) {
  const [scopes, setScopes] = useState<LoomScope[]>([])
  const [scope, setScope] = useState('mine')
  const [view, setView] = useState<View>('images')
  const [tag, setTag] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [assets, setAssets] = useState<LoomPickAsset[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [loading, startLoad] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Clear the multi-select basket on every close path, so the next open starts empty (no
  // setState-in-effect: reset here, at the close, instead).
  const close = () => { setSelected([]); onClose() }

  // Resolve the caller's scopes once per open.
  useEffect(() => {
    if (!open) return
    let live = true
    loomScopes().then((r) => { if (live) setScopes(r.scopes) }).catch(() => {})
    return () => { live = false }
  }, [open])

  const refresh = useCallback(
    (opts: { scope: string; view: View; tag: string | null; q: string }) => {
      startLoad(async () => {
        setError(null)
        const res = await loomImages(opts.scope, {
          q: opts.q || undefined,
          tag: opts.tag || undefined,
          view: opts.view === 'elements' ? 'elements' : 'images',
        })
        setAssets(res.assets)
        setTags(res.tags)
      })
    },
    [],
  )

  // Reload when scope / view / tag change (query has its own debounce below).
  useEffect(() => {
    if (!open) return
    refresh({ scope, view, tag, q: query })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, view, tag])

  // Debounced text search.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => refresh({ scope, view, tag, q: query }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const doUpload = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'))
      if (images.length === 0) return
      setError(null)
      setUploading(true)
      let firstUrl: string | null = null
      for (const file of images) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await uploadLoomImage(scope, fd)
        if ('error' in res) { setError(res.error); continue }
        if (!firstUrl) firstUrl = res.url
        setAssets((prev) => [
          { id: res.id, title: file.name, url: res.url, alt: null, generated: false, tags: [] },
          ...prev.filter((a) => a.id !== res.id),
        ])
      }
      setUploading(false)
    },
    [scope],
  )

  if (!open) return null

  const pick = (url: string) => {
    if (multiple) {
      setSelected((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]))
      return
    }
    onSelect?.(url)
    close()
  }
  const confirmMany = () => { if (selected.length) onSelectMany?.(selected); close() }
  const rail = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors'
  const railOn = 'bg-primary-bg text-primary-strong font-semibold'
  const railOff = 'text-muted hover:bg-surface-elevated hover:text-text'

  return (
    <Dialog open={open} onClose={close} ariaLabel={title} className="max-w-4xl">
      <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-bold text-text">{title}</h2>
          <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1 text-subtle hover:bg-surface-elevated hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left rail: view categories + per-space scopes */}
          <aside className="w-48 shrink-0 space-y-3 overflow-y-auto border-r border-border p-3">
            <div className="space-y-0.5">
              <p className="px-2.5 pb-1 text-2xs font-semibold uppercase tracking-wide text-subtle">Browse</p>
              <button type="button" onClick={() => { setView('images'); setTag(null) }} className={`${rail} ${view === 'images' && !tag ? railOn : railOff}`}>
                <ImageIcon className="h-4 w-4 shrink-0" /> Images
              </button>
              <button type="button" onClick={() => { setView('elements'); setTag(null) }} className={`${rail} ${view === 'elements' ? railOn : railOff}`}>
                <Sparkles className="h-4 w-4 shrink-0" /> Elements
              </button>
              <button type="button" onClick={() => setView('tags')} className={`${rail} ${view === 'tags' ? railOn : railOff}`}>
                <TagIcon className="h-4 w-4 shrink-0" /> Tags
              </button>
            </div>

            <div className="space-y-0.5">
              <p className="px-2.5 pb-1 text-2xs font-semibold uppercase tracking-wide text-subtle">Library</p>
              {scopes.map((s) => {
                const on = s.key === scope
                const Icon = s.kind === 'mine' ? User : Building2
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => { setScope(s.key); setTag(null); if (view === 'tags') setView('images') }}
                    className={`${rail} ${on ? railOn : railOff}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    {on && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </aside>

          {/* Main: upload box + grid (or tag list) */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Upload box (click-multi + drag & drop) */}
            <div className="border-b border-border p-3">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); void doUpload(Array.from(e.dataTransfer.files)) }}
                className={`flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors ${dragging ? 'border-primary bg-primary-bg/40 text-primary-strong' : 'border-border text-muted'}`}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span>
                  {uploading ? 'Uploading…' : 'Drag images here, or '}
                  {!uploading && (
                    <button type="button" onClick={() => fileRef.current?.click()} className="font-semibold text-primary-strong underline-offset-2 hover:underline">
                      upload images
                    </button>
                  )}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { void doUpload(Array.from(e.target.files ?? [])); e.target.value = '' }}
                />
              </div>
              {/* Search within the scope */}
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-subtle" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search this library"
                  className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle"
                />
              </div>
              {error && <p className="mt-2 text-2xs text-danger">{error}</p>}
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {view === 'tags' ? (
                <div>
                  {tags.length === 0 ? (
                    <p className="py-8 text-center text-sm text-subtle">No tags yet in this library.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setTag(t); setView('images') }}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-primary/50 hover:text-text"
                        >
                          <TagIcon className="h-3 w-3" /> {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {tag && (
                    <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-0.5 font-medium text-primary-strong">
                        <TagIcon className="h-3 w-3" /> {tag}
                      </span>
                      <button type="button" onClick={() => setTag(null)} className="text-subtle hover:text-text">Clear</button>
                    </div>
                  )}
                  {view === 'elements' && (
                    <p className="mb-2 text-2xs text-subtle">Elements are images created with AI. Upload generated art here, or generate new Elements (coming soon).</p>
                  )}
                  {loading ? (
                    <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
                  ) : assets.length === 0 ? (
                    <p className="py-10 text-center text-sm text-subtle">
                      {view === 'elements' ? 'No AI-created images here yet.' : 'Nothing here yet. Upload an image to get started.'}
                    </p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {assets.map((a) => {
                        const on = multiple && selected.includes(a.url)
                        return (
                          <li key={a.id}>
                            <button
                              type="button"
                              onClick={() => pick(a.url)}
                              title={a.title}
                              aria-pressed={multiple ? on : undefined}
                              className={`group relative block aspect-square w-full overflow-hidden rounded-xl border bg-canvas outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 ${on ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary'}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- Loom asset on a user-controlled Storage host, not a configured next/image domain */}
                              <img src={a.url} alt={a.alt ?? ''} loading="lazy" className="h-full w-full object-cover" />
                              {a.generated && (
                                <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-canvas/90 px-1.5 py-0.5 text-2xs font-semibold text-primary-strong shadow-sm">
                                  <Sparkles className="h-2.5 w-2.5" /> AI
                                </span>
                              )}
                              {on && (
                                <span className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm">
                                  <Check className="h-3 w-3" />
                                </span>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Multi-select confirm bar */}
        {multiple && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <span className="text-sm text-muted">{selected.length} selected</span>
            <button
              type="button"
              onClick={confirmMany}
              disabled={selected.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Add {selected.length > 0 ? selected.length : ''}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  )
}
