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
  Upload, Loader2, ImageIcon, Sparkles, Tag as TagIcon, Building2, User, Check, X, Search, Shapes,
} from 'lucide-react'
import { loomScopes, loomScope as loomScopeAction, loomImages, uploadLoomImage, type LoomScope, type LoomPickerConfig } from '@/lib/loom/picker-actions'
import { searchSiteIcons, type SiteIcon } from '@/lib/loom/site-icons'
import { looksLikeImage } from '@/lib/library/upload-kinds'
import type { LoomPickAsset } from '@/lib/library/store'

// Fallback config until the resolved one loads (matches the registry defaults). The real config comes
// from the element_settings master (role-gated), resolved server-side by loomScopes().
const FALLBACK_CONFIG: LoomPickerConfig = {
  tabs: { images: true, icons: true, elements: true, tags: true, spaces: true, airwaves: false },
  aiCreate: false,
  defaultScope: 'mine',
}

type View = 'images' | 'icons' | 'elements' | 'tags'

// The library_assets `kind`s each browse view pulls. Purpose-scoping intersects a caller's `kinds`
// with these, so a photo picker never surfaces icons/audio and a logo picker can offer both.
const KINDS_FOR_VIEW: Record<'images' | 'icons' | 'elements', string[]> = {
  images: ['image'],
  icons: ['icon'],
  elements: ['image', 'element'],
}

// The server-action body ceiling, kept safely UNDER next.config's 10mb serverActions.bodySizeLimit. An
// upload over this is rejected by the framework itself (a THROWN server action), so we shrink or skip
// BEFORE sending — never let an over-limit request hang the "Uploading…" spinner.
const MAX_UPLOAD_BYTES = 9 * 1024 * 1024
// Downscale target for oversized photos: the longest edge, and the JPEG quality to re-encode at. 2560px
// is ample for a full-bleed header while bringing a modern 12–48MP photo well under the upload ceiling.
const SHRINK_MAX_DIM = 2560
const SHRINK_QUALITY = 0.85

/**
 * Best-effort BROWSER-side downscale so a large photo fits under the upload ceiling (and uploads faster).
 * Only touches raster formats this browser can decode (JPEG/PNG/WebP) that are actually over the ceiling;
 * SVG/GIF/HEIC and already-small files pass through untouched (HEIC can't be canvas-decoded in Chrome).
 * Re-encodes to JPEG bounded to SHRINK_MAX_DIM. FAIL-SAFE: any decode/encode failure returns the ORIGINAL
 * file, so the upload still attempts with what we have.
 */
async function shrinkForUpload(file: File): Promise<File> {
  const decodable = /^image\/(jpeg|png|webp)$/i.test(file.type)
  if (!decodable || file.size <= MAX_UPLOAD_BYTES) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, SHRINK_MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close?.(); return file }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', SHRINK_QUALITY))
    if (!blob || blob.size === 0 || blob.size >= file.size) return file
    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export function LoomPicker({
  open,
  onClose,
  onSelect,
  onSelectMany,
  multiple = false,
  title = 'Choose an image',
  scopeKey,
  kinds,
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
  /** Lock the picker to ONE Loom scope ('mine' or a Space id) — the context being edited. When set, the
   *  left-rail scope switcher is hidden and only this scope's images/tags load (still authorized +
   *  fail-safe server-side). Undefined = the full multi-scope picker (My uploads + every operated Space). */
  scopeKey?: string
  /** PURPOSE scoping — the asset families relevant to the surface that opened the picker. A profile
   *  photo passes ['image'] (no Icons view); a logo passes ['image','icon']; an Airwaves field
   *  ['audio','video']. Undefined = the full asset manager (every family the config allows). Each browse
   *  view is only offered when the purpose includes its family, so a popup shows only relevant assets. */
  kinds?: string[]
}) {
  const [scopes, setScopes] = useState<LoomScope[]>([])
  const [config, setConfig] = useState<LoomPickerConfig>(FALLBACK_CONFIG)
  const [scope, setScope] = useState(scopeKey ?? 'mine')
  const [view, setView] = useState<View>('images')
  const [tag, setTag] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [assets, setAssets] = useState<LoomPickAsset[]>([])
  const [siteIcons, setSiteIcons] = useState<SiteIcon[]>([])
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

  // Resolve scope(s) + the role-gated config once per open. setState lands inside the async callback
  // (not synchronously in the effect body), so it honors the no-setState-in-effect rule.
  //   - scopeKey set  → lock to that ONE authorized scope (no left-rail switcher, no operated-space list).
  //   - scopeKey unset → the full multi-scope picker (My uploads + every operated Space).
  useEffect(() => {
    if (!open) return
    let live = true
    if (scopeKey) {
      loomScopeAction(scopeKey)
        .then((r) => {
          if (!live) return
          setScope(scopeKey)
          setScopes(r.scope ? [r.scope] : [])
          setConfig(r.config)
        })
        .catch(() => {})
    } else {
      loomScopes()
        .then((r) => {
          if (!live) return
          setScopes(r.scopes)
          setConfig(r.config)
          // Honor the configured default scope: open on the first Space when set to 'space'.
          if (r.config.defaultScope === 'space') {
            const firstSpace = r.scopes.find((s) => s.kind === 'space')
            if (firstSpace) setScope(firstSpace.key)
          }
        })
        .catch(() => {})
    }
    return () => { live = false }
  }, [open, scopeKey])

  const refresh = useCallback(
    (opts: { scope: string; view: View; tag: string | null; q: string }) => {
      startLoad(async () => {
        setError(null)
        const viewKinds = opts.view === 'icons' ? KINDS_FOR_VIEW.icons
          : opts.view === 'elements' ? KINDS_FOR_VIEW.elements
          : KINDS_FOR_VIEW.images
        // The Icons view unions the scope's UPLOADED icons with the house SITE icons (Lucide/Phosphor/
        // Tabler), each resolved to a self-contained SVG data URL server-side.
        const [res, site] = await Promise.all([
          loomImages(opts.scope, {
            q: opts.q || undefined,
            tag: opts.tag || undefined,
            kinds: viewKinds,
            generatedOnly: opts.view === 'elements',
          }),
          opts.view === 'icons' ? searchSiteIcons(opts.q, 60) : Promise.resolve([] as SiteIcon[]),
        ])
        setAssets(res.assets)
        setTags(res.tags)
        setSiteIcons(site)
      })
    },
    [],
  )

  // Which browse views this popup offers = the role-gated config INTERSECTED with the caller's purpose
  // (`kinds`). No purpose = the full asset manager (every family the config allows).
  const wants = (fam: string) => !kinds || kinds.length === 0 || kinds.includes(fam)
  const showImages = config.tabs.images && wants('image')
  const showIcons = config.tabs.icons && wants('icon')
  const showElements = config.tabs.elements && (wants('image') || wants('element'))
  const showTags = config.tabs.tags && (showImages || showIcons)
  const availableViews: View[] = [
    ...(showImages ? ['images' as const] : []),
    ...(showIcons ? ['icons' as const] : []),
    ...(showElements ? ['elements' as const] : []),
    ...(showTags ? ['tags' as const] : []),
  ]
  // The view actually shown: the user's selection when it is still offered, else the first available
  // one. Derived (not stored), so a narrowed purpose never needs a setState-in-effect to correct it.
  const activeView: View = availableViews.includes(view) ? view : (availableViews[0] ?? 'images')

  // The grid's tiles, normalized across sources. The Icons view appends the house SITE icons (SVG data
  // URLs) after any uploaded icons; every other view is just its assets. `contain` = pad + object-contain
  // (glyphs), else object-cover (photos). Value is what gets picked/stored (a URL or a data URL).
  const tiles: { key: string; value: string; label: string; src: string; contain: boolean; generated: boolean }[] = [
    ...assets.map((a) => ({ key: a.id, value: a.url, label: a.title, src: a.url, contain: a.kind === 'icon', generated: a.generated })),
    ...(activeView === 'icons'
      ? siteIcons.map((s) => ({ key: `site:${s.name}`, value: s.dataUrl, label: s.label, src: s.dataUrl, contain: true, generated: false }))
      : []),
  ]

  // Reload when scope / active view / tag change (query has its own debounce below).
  useEffect(() => {
    if (!open) return
    refresh({ scope, view: activeView, tag, q: query })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, activeView, tag])

  // Debounced text search.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => refresh({ scope, view: activeView, tag, q: query }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const doUpload = useCallback(
    async (files: File[]) => {
      // Accept by MIME OR by image extension: iPhone .heic photos often arrive with a blank File.type,
      // and dropping them here made the uploader silently do nothing. If some files are not images, say so.
      const images = files.filter((f) => looksLikeImage(f.type, f.name))
      if (images.length === 0) {
        if (files.length > 0) setError('Choose an image file (JPEG, PNG, GIF, WebP, HEIC, AVIF, or SVG).')
        return
      }
      setError(null)
      setUploading(true)
      let firstUrl: string | null = null
      let threw = false
      let skipped = 0
      try {
        for (const raw of images) {
          // A big header photo can exceed next.config's 10mb serverActions.bodySizeLimit; the framework then
          // REJECTS the request (a thrown server action, not a returned error) — which previously left the
          // spinner turning forever. Downscale/re-encode large photos in the browser first so they fit; a
          // format we can't safely rasterize (SVG/GIF/HEIC in this browser) is left as-is and size-gated.
          const file = await shrinkForUpload(raw)
          if (file.size > MAX_UPLOAD_BYTES) { skipped++; continue }
          const fd = new FormData()
          fd.append('file', file)
          // WRAP the server action: a rejection (framework body-limit, transient network error) must show
          // an inline message and let the loop continue — never escape and hang the "Uploading…" spinner.
          let res: Awaited<ReturnType<typeof uploadLoomImage>>
          try {
            res = await uploadLoomImage(scope, fd)
          } catch {
            threw = true
            continue
          }
          if ('error' in res) { setError(res.error); continue }
          if (!firstUrl) firstUrl = res.url
          setAssets((prev) => [
            { id: res.id, title: file.name, url: res.url, alt: null, kind: 'image', generated: false, tags: [] },
            ...prev.filter((a) => a.id !== res.id),
          ])
        }
      } finally {
        // ALWAYS clear the spinner, whatever happened above.
        setUploading(false)
      }
      if (skipped > 0) {
        setError(`${skipped} image${skipped === 1 ? ' is' : 's are'} too large to upload even after resizing (max 9 MB). Try a smaller version.`)
      } else if (threw && !firstUrl) {
        setError('That upload did not go through. Try again in a moment.')
      }
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
    <Dialog open={open} onClose={close} ariaLabel={title} align="center" className="max-w-4xl">
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
              {showImages && (
                <button type="button" onClick={() => { setView('images'); setTag(null) }} className={`${rail} ${activeView === 'images' && !tag ? railOn : railOff}`}>
                  <ImageIcon className="h-4 w-4 shrink-0" /> Images
                </button>
              )}
              {showIcons && (
                <button type="button" onClick={() => { setView('icons'); setTag(null) }} className={`${rail} ${activeView === 'icons' ? railOn : railOff}`}>
                  <Shapes className="h-4 w-4 shrink-0" /> Icons
                </button>
              )}
              {showElements && (
                <button type="button" onClick={() => { setView('elements'); setTag(null) }} className={`${rail} ${activeView === 'elements' ? railOn : railOff}`}>
                  <Sparkles className="h-4 w-4 shrink-0" /> Elements
                </button>
              )}
              {showTags && (
                <button type="button" onClick={() => setView('tags')} className={`${rail} ${activeView === 'tags' ? railOn : railOff}`}>
                  <TagIcon className="h-4 w-4 shrink-0" /> Tags
                </button>
              )}
            </div>

            {/* Scope switcher — only in the multi-scope picker. When locked to a single scopeKey, the
                caller has already chosen the context, so no switcher renders. */}
            {!scopeKey && config.tabs.spaces && (
            <div className="space-y-0.5">
              <p className="px-2.5 pb-1 text-2xs font-semibold uppercase tracking-wide text-subtle">Library</p>
              {scopes.map((s) => {
                const on = s.key === scope
                const Icon = s.kind === 'mine' ? User : Building2
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => { setScope(s.key); setTag(null); if (activeView === 'tags') setView('images') }}
                    className={`${rail} ${on ? railOn : railOff}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    {on && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                )
              })}
            </div>
            )}
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
              {activeView === 'tags' ? (
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
                  {activeView === 'elements' && (
                    <p className="mb-2 text-2xs text-subtle">Elements are images created with AI. Upload generated art here, or generate new Elements (coming soon).</p>
                  )}
                  {activeView === 'icons' && (
                    <p className="mb-2 text-2xs text-subtle">Site icons plus any you upload. Search by name, or drop a new icon above.</p>
                  )}
                  {loading ? (
                    <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
                  ) : tiles.length === 0 ? (
                    <p className="py-10 text-center text-sm text-subtle">
                      {activeView === 'elements' ? 'No AI-created images here yet.'
                        : activeView === 'icons' ? 'No icons here yet. Upload one above, or search the site icons.'
                        : 'Nothing here yet. Upload an image to get started.'}
                    </p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {tiles.map((t) => {
                        const on = multiple && selected.includes(t.value)
                        return (
                          <li key={t.key}>
                            <button
                              type="button"
                              onClick={() => pick(t.value)}
                              title={t.label}
                              aria-pressed={multiple ? on : undefined}
                              className={`group relative block aspect-square w-full overflow-hidden rounded-xl border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 ${t.contain ? 'bg-surface' : 'bg-canvas'} ${on ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary'}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- Loom asset URL or an inline SVG data URL, not a configured next/image domain */}
                              <img src={t.src} alt={t.label} loading="lazy" className={`h-full w-full ${t.contain ? 'object-contain p-3' : 'object-cover'}`} />
                              {t.generated && (
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
