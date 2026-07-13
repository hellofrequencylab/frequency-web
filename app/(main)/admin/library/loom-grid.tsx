'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  X,
  Copy,
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  Archive,
  Trash2,
  ImageOff,
  Download,
  FolderInput,
  FolderMinus,
  Tag,
  Loader2,
  Sparkles,
  Wand2,
  Undo2,
  Eye,
  BadgeCheck,
  RefreshCw,
  Palette,
  Music,
  Sparkles as SparklesIcon,
} from 'lucide-react'
import type { LibraryGalleryItem, LibraryCollection } from '@/lib/library/store'
import { renderRegistryElement, isRenderableElement } from '@/lib/library/element-registry'
import { sanitizeSvg } from '@/lib/library/svg-sanitize'
import {
  downloadElementSvg,
  downloadElementPng,
  downloadImageUrl,
  rasterizeSvgElement,
  extForMime,
} from '@/lib/library/export-svg'
import { updateLibraryAssetMeta, archiveLibraryAsset, deleteLibraryAsset } from './actions'
import { editLoomSvg, saveElementSvg, reviewLoomSvg, type LoomEditMode } from './vera-actions'
import { RecraftEditRow, AssetVersions } from './recraft-studio'
import { AssetAvPanel } from './asset-av-panel'
import { createBrandStyle } from './recraft-actions'
import {
  addAssetsToCollection,
  removeAssetsFromCollection,
  createCollection,
  bulkSetCategory,
  bulkAddTags,
  bulkArchive,
  bulkDelete,
} from './collections-actions'

function human(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** True when an `element` asset resolves to a drawable code element (any registry). */
function isRegistryElement(asset: LibraryGalleryItem): boolean {
  return asset.kind === 'element' && isRenderableElement(asset.config?.registry, asset.config?.name)
}

/** A Vera-generated card stores its SVG string in config.svg. Re-validate before render. */
function safeElementSvg(asset: LibraryGalleryItem): string | null {
  const raw = asset.config?.svg
  if (typeof raw !== 'string' || !raw) return null
  const c = sanitizeSvg(raw)
  return c.ok ? c.svg : null
}

/** Renders an asset's visual: a Vera-drawn SVG, a code element via its registry, a
 *  file via <img>, or a placeholder. `fit` picks cover (grid tiles) vs contain (preview). */
function Thumb({ asset, fit }: { asset: LibraryGalleryItem; fit: 'cover' | 'contain' }) {
  if (asset.kind === 'element') {
    const raw = safeElementSvg(asset)
    if (raw) {
      return (
        <div
          className="flex h-full w-full items-center justify-center p-4 [&>svg]:h-full [&>svg]:w-auto [&>svg]:max-w-full"
          // Sanitized at save AND re-validated by safeElementSvg above before this render.
          dangerouslySetInnerHTML={{ __html: raw }}
        />
      )
    }
    const drawn = renderRegistryElement(asset.config?.registry, asset.config?.name, asset.config?.pillar)
    if (drawn) {
      return <div className="flex h-full w-full items-center justify-center p-4">{drawn}</div>
    }
  }
  // Airwaves A/V (ADR-608 §7e): audio/video assets preview with a real scrub player, not a broken <img>.
  if (asset.url && asset.kind === 'video') {
    return <video src={asset.url} controls preload="metadata" className="h-full w-full bg-black object-contain" />
  }
  if (asset.url && asset.kind === 'audio') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4">
        <Music className="h-10 w-10 text-subtle" aria-hidden />
        <audio src={asset.url} controls preload="metadata" className="w-full max-w-xs" />
      </div>
    )
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
export type LoomView = 'cards' | 'compact' | 'list'

export function LoomGrid({
  assets,
  collections,
  activeCollectionId,
  view = 'cards',
  recraftEnabled = false,
}: {
  assets: LibraryGalleryItem[]
  collections: LibraryCollection[]
  activeCollectionId?: string
  view?: LoomView
  recraftEnabled?: boolean
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const selected = assets.find((a) => a.id === openId) ?? null

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const allSelected = assets.length > 0 && assets.every((a) => sel.has(a.id))
  function toggleAll() {
    setSel(allSelected ? new Set() : new Set(assets.map((a) => a.id)))
  }
  const clear = () => setSel(new Set())

  // The select dot, shared across views. Visible when hovered or once a selection exists.
  const SelDot = ({ id, className = '' }: { id: string; className?: string }) => {
    const isSel = sel.has(id)
    return (
      <button
        type="button"
        onClick={() => toggle(id)}
        aria-pressed={isSel}
        aria-label={isSel ? 'Deselect' : 'Select'}
        className={`rounded-full bg-surface/90 shadow-sm transition-opacity ${
          isSel || sel.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        } ${className}`}
      >
        {isSel ? <CheckCircle2 className="h-6 w-6 text-primary" /> : <Circle className="h-6 w-6 text-subtle" />}
      </button>
    )
  }

  const compact = view === 'compact'

  return (
    <>
      <BulkBar
        ids={[...sel]}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={clear}
        collections={collections}
        activeCollectionId={activeCollectionId}
        recraftEnabled={recraftEnabled}
      />

      {view === 'list' ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {assets.map((a) => {
            const isSel = sel.has(a.id)
            return (
              <div
                key={a.id}
                className={`group flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 ${
                  isSel ? 'bg-primary-bg/40' : 'hover:bg-surface-elevated'
                }`}
              >
                <SelDot id={a.id} className="[&_svg]:h-5 [&_svg]:w-5" />
                <button
                  type="button"
                  onClick={() => setOpenId(a.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="block h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-elevated">
                    <Thumb asset={a} fit="cover" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text" title={a.title}>
                    {a.title}
                  </span>
                  <span className="hidden w-20 shrink-0 truncate text-xs text-subtle sm:block">{a.kind}</span>
                  <span className="hidden w-32 shrink-0 truncate text-xs text-subtle md:block">{a.category ?? ''}</span>
                  <span className="w-16 shrink-0 text-right text-xs text-subtle">{human(a.bytes)}</span>
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div
          className={
            compact
              ? 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'
              : 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'
          }
        >
          {assets.map((a, i) => {
            const isSel = sel.has(a.id)
            // Mobile "rail of single cards → two cards": the first card spans full width, the rest
            // fall to 2-up. Only on the smallest screens (sm+ uses the normal even grid).
            const featured = i === 0 && !compact
            return (
              <div
                key={a.id}
                className={`group relative overflow-hidden rounded-2xl border bg-surface shadow-sm transition-shadow hover:shadow-pop ${
                  featured ? 'col-span-2 sm:col-span-1' : ''
                } ${isSel ? 'border-primary ring-2 ring-primary' : 'border-border'}`}
              >
                <SelDot id={a.id} className={`absolute left-2 top-2 z-10 ${compact ? '[&_svg]:h-5 [&_svg]:w-5' : ''}`} />
                <button type="button" onClick={() => setOpenId(a.id)} className="block w-full text-left">
                  <span
                    className={`block ${
                      compact ? 'aspect-square' : 'aspect-[4/3]'
                    } overflow-hidden bg-surface-elevated transition-transform duration-200 group-hover:scale-[1.02]`}
                  >
                    <Thumb asset={a} fit="cover" />
                  </span>
                  {compact ? (
                    <span className="block truncate px-2 py-1 text-2xs text-text" title={a.title}>
                      {a.title}
                    </span>
                  ) : (
                    <span className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="truncate text-sm text-text" title={a.title}>
                        {a.title}
                      </span>
                      <span className="shrink-0 text-xs text-subtle">{human(a.bytes)}</span>
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {selected && <DetailDrawer asset={selected} onClose={() => setOpenId(null)} recraftEnabled={recraftEnabled} />}
    </>
  )
}

// The bulk-action toolbar above the grid: a select-all toggle + a live count, and (when
// anything is selected) actions that run across the whole selection — add/remove from a
// collection, set a category, add tags, archive, delete. Each runs the janitor-gated action,
// then refreshes and clears the selection.
function BulkBar({
  ids,
  allSelected,
  onToggleAll,
  onClear,
  collections,
  activeCollectionId,
  recraftEnabled = false,
}: {
  ids: string[]
  allSelected: boolean
  onToggleAll: () => void
  onClear: () => void
  collections: LibraryCollection[]
  activeCollectionId?: string
  recraftEnabled?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [menu, setMenu] = useState(false)
  const [styleMenu, setStyleMenu] = useState(false)
  const [styleName, setStyleName] = useState('')
  const [styleLane, setStyleLane] = useState<'vector' | 'raster'>('vector')
  const [err, setErr] = useState<string | null>(null)
  const n = ids.length
  // Recraft trains a style from 1–5 reference images.
  const canTrainStyle = recraftEnabled && n >= 1 && n <= 5

  function trainStyle() {
    if (!styleName.trim()) return
    setErr(null)
    start(async () => {
      const res = await createBrandStyle({ name: styleName.trim(), lane: styleLane, assetIds: ids })
      if ('error' in res) {
        setErr(res.error)
        return
      }
      setStyleMenu(false)
      setStyleName('')
      onClear()
      router.refresh()
    })
  }

  function run(fn: () => Promise<{ ok?: true; error?: string } | { error: string }>) {
    setErr(null)
    setMenu(false)
    start(async () => {
      const res = await fn()
      if (res && 'error' in res && res.error) {
        setErr(res.error)
        return
      }
      onClear()
      router.refresh()
    })
  }

  const btn =
    'inline-flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-sm text-text hover:bg-surface-elevated disabled:opacity-50'

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface-elevated/60 px-3 py-2">
      <button
        type="button"
        onClick={onToggleAll}
        className="inline-flex items-center gap-2 rounded-xl px-2 py-1 text-sm font-medium text-text hover:bg-surface-elevated"
      >
        {allSelected ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-subtle" />}
        {allSelected ? 'Clear page' : 'Select page'}
      </button>

      <span className="text-sm text-subtle">{n > 0 ? `${n} selected` : 'Select assets to edit in bulk'}</span>

      {pending && <Loader2 className="h-4 w-4 animate-spin text-subtle" aria-label="Working" />}

      {n > 0 && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Add to collection */}
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} disabled={pending} className={btn}>
              <FolderInput className="h-4 w-4" /> Add to collection
            </button>
            {menu && (
              <div className="absolute right-0 z-20 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-border bg-surface p-1 shadow-pop">
                {collections.length === 0 && (
                  <p className="px-3 py-2 text-xs text-subtle">No collections yet.</p>
                )}
                {collections.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => run(() => addAssetsToCollection(c.id, ids))}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-text hover:bg-surface-elevated"
                  >
                    <span className="truncate">{c.title}</span>
                    <span className="shrink-0 text-xs text-subtle">{c.count}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const title = window.prompt('New collection name')
                    if (!title || !title.trim()) return
                    run(async () => {
                      const created = await createCollection(title.trim())
                      if ('error' in created) return created
                      return addAssetsToCollection(created.id, ids)
                    })
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-border px-3 py-1.5 text-left text-sm font-medium text-primary-strong hover:bg-surface-elevated"
                >
                  <FolderInput className="h-4 w-4" /> New collection…
                </button>
              </div>
            )}
          </div>

          {/* Train a brand style from the selected 1–5 images (Recraft, ADR-489). */}
          {canTrainStyle && (
            <div className="relative">
              <button type="button" onClick={() => setStyleMenu((v) => !v)} disabled={pending} className={btn}>
                <Palette className="h-4 w-4" /> Train style
              </button>
              {styleMenu && (
                <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-border bg-surface p-3 shadow-pop">
                  <p className="mb-2 text-xs text-subtle">
                    Teach a house look from these {n} image{n === 1 ? '' : 's'}. Pick it later in the studio to match a whole set.
                  </p>
                  <input
                    autoFocus
                    value={styleName}
                    onChange={(e) => setStyleName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && trainStyle()}
                    placeholder="Style name (e.g. Warm icon set)"
                    className="mb-2 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
                  />
                  <div className="mb-2 inline-flex rounded-xl border border-border p-0.5">
                    {(['vector', 'raster'] as const).map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setStyleLane(l)}
                        aria-pressed={styleLane === l}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                          styleLane === l ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-elevated'
                        }`}
                      >
                        {l === 'vector' ? 'Vector' : 'Raster'}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={trainStyle}
                    disabled={pending || !styleName.trim()}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-on-primary hover:bg-primary-hover disabled:opacity-70"
                  >
                    <Palette className="h-4 w-4" /> Train style
                  </button>
                </div>
              )}
            </div>
          )}

          {activeCollectionId && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removeAssetsFromCollection(activeCollectionId, ids))}
              className={btn}
            >
              <FolderMinus className="h-4 w-4" /> Remove from folder
            </button>
          )}

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const cat = window.prompt('Set category (folder) for the selected assets. Leave blank to clear.')
              if (cat === null) return
              run(() => bulkSetCategory(ids, cat))
            }}
            className={btn}
          >
            <Tag className="h-4 w-4" /> Set category
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const tags = window.prompt('Add tags (comma-separated) to the selected assets')
              if (!tags || !tags.trim()) return
              run(() => bulkAddTags(ids, tags))
            }}
            className={btn}
          >
            <Tag className="h-4 w-4" /> Add tags
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Archive ${n} asset${n === 1 ? '' : 's'}? They can be restored later.`))
                run(() => bulkArchive(ids))
            }}
            className={btn}
          >
            <Archive className="h-4 w-4" /> Archive
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Permanently delete ${n} asset${n === 1 ? '' : 's'}? This cannot be undone.`))
                run(() => bulkDelete(ids))
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-danger px-2.5 py-1.5 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}

      {err && <p className="w-full text-sm text-danger">{err}</p>}
    </div>
  )
}

function DetailDrawer({
  asset,
  onClose,
  recraftEnabled,
}: {
  asset: LibraryGalleryItem
  onClose: () => void
  recraftEnabled: boolean
}) {
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
  const isElement = asset.kind === 'element' && (isRegistryElement(asset) || !!safeElementSvg(asset))

  // Vera design assistant (SVG elements only): iterate on the graphic by instruction, and let
  // her CHECK her work — render the result to an image, look at it (vision), and self-correct.
  const [override, setOverride] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')
  const [veraErr, setVeraErr] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState<string | null>(null)
  const [veraBusy, startVera] = useTransition()
  const [reviewing, setReviewing] = useState(false)
  const autoReview = useRef(false)
  const safeOverride = override && sanitizeSvg(override).ok ? override : null

  function previewSvg(): SVGSVGElement | null {
    return previewRef.current?.querySelector('svg') ?? null
  }
  /** The SVG Vera should edit: the current override, else the stored svg, else the live render. */
  function currentSvgString(): string | null {
    if (safeOverride) return safeOverride
    const stored = safeElementSvg(asset)
    if (stored) return stored
    const el = previewSvg()
    return el ? new XMLSerializer().serializeToString(el) : null
  }
  function askVera(mode: LoomEditMode) {
    const svg = currentSvgString()
    if (!svg || !instruction.trim()) return
    const el = previewSvg() // capture the CURRENT render so Vera can see what she's changing
    setVeraErr(null)
    setReviewNote(null)
    startVera(async () => {
      let image = ''
      try {
        if (el) image = await rasterizeSvgElement(el, 512)
      } catch {
        /* fall back to code-only if rasterization fails */
      }
      const res = await editLoomSvg(svg, instruction, image, mode)
      if ('error' in res) setVeraErr(res.error)
      else {
        setOverride(res.svg)
        // Only auto-check a full redraw. A tweak is meant to stay near-identical, so leave it
        // alone (the auto-check was over-editing tweaks); "Check her work" is available manually.
        autoReview.current = mode === 'redraw'
      }
    })
  }
  /** Render the current graphic and have Vera look at it, correcting if it reads wrong. */
  async function reviewCurrent() {
    const el = previewSvg()
    const svgStr = currentSvgString()
    if (!el || !svgStr) return
    setVeraErr(null)
    setReviewing(true)
    try {
      const imageBase64 = await rasterizeSvgElement(el, 512)
      const res = await reviewLoomSvg({ svg: svgStr, instruction, imageBase64 })
      if ('error' in res) setVeraErr(res.error)
      else if ('svg' in res) {
        setOverride(res.svg)
        setReviewNote(res.note)
      } else {
        setReviewNote(res.note)
      }
    } catch {
      setVeraErr('Could not render the graphic to check it.')
    } finally {
      setReviewing(false)
    }
  }
  // After an edit paints, auto-run one review pass so Vera catches her own mistakes.
  useEffect(() => {
    if (!autoReview.current || !safeOverride) return
    autoReview.current = false
    const id = requestAnimationFrame(() => void reviewCurrent())
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeOverride])

  function saveVera() {
    if (!safeOverride) return
    setVeraErr(null)
    startVera(async () => {
      const res = await saveElementSvg(asset.id, safeOverride)
      if ('error' in res) setVeraErr(res.error)
      else {
        router.refresh()
        onClose()
      }
    })
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
            {safeOverride ? (
              <div
                className="flex h-full w-full items-center justify-center p-4 text-text [&>svg]:h-full [&>svg]:w-auto [&>svg]:max-w-full"
                // Sanitized in the action AND re-checked by safeOverride before this render.
                dangerouslySetInnerHTML={{ __html: safeOverride }}
              />
            ) : (
              <Thumb asset={asset} fit="contain" />
            )}
          </div>
          {safeOverride && (
            <p className="-mt-2 text-xs text-primary-strong">Vera edit preview. Save to keep it, or revert.</p>
          )}

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
            <a href={`/admin/library?similar=${asset.id}`} className={chipCls}>
              <SparklesIcon className="h-4 w-4" /> Find similar
            </a>
          </div>

          {/* Design with Vera — edit this graphic by describing the change (SVG elements only). */}
          {isElement && (
            <div className="rounded-2xl border border-border bg-surface-elevated/50 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text">
                <Sparkles className="h-4 w-4 text-primary-strong" aria-hidden />
                Design with Vera
              </p>
              <textarea
                className={inputCls}
                rows={2}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. thin the stroke a little, make the center leaf translucent"
              />
              <p className="mt-1.5 text-xs text-subtle">
                <b className="font-semibold text-text">Tweak</b> keeps it nearly identical (small changes).{' '}
                <b className="font-semibold text-text">Redraw</b> rebuilds it (bigger changes). Both keep the original
                colors.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => askVera('tweak')}
                  disabled={veraBusy || reviewing || !instruction.trim()}
                  title="A small, surgical change that keeps the graphic nearly identical"
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-primary px-3 py-1.5 text-sm font-bold text-on-primary hover:bg-primary-hover disabled:opacity-70"
                >
                  {veraBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {veraBusy ? 'Working…' : 'Tweak'}
                </button>
                <button
                  type="button"
                  onClick={() => askVera('redraw')}
                  disabled={veraBusy || reviewing || !instruction.trim()}
                  title="Rebuild the whole graphic from scratch, for bigger changes"
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-border-strong px-3 py-1.5 text-sm font-semibold text-text hover:bg-surface-elevated disabled:opacity-70"
                >
                  <RefreshCw className="h-4 w-4" /> Redraw
                </button>
                <button
                  type="button"
                  onClick={() => void reviewCurrent()}
                  disabled={veraBusy || reviewing}
                  title="Vera renders it, looks at it, and fixes anything clearly broken"
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-elevated disabled:opacity-70"
                >
                  {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  {reviewing ? 'Checking…' : 'Check her work'}
                </button>
                {safeOverride && (
                  <>
                    <button
                      type="button"
                      onClick={saveVera}
                      disabled={veraBusy || reviewing}
                      className="rounded-2xl bg-signal px-3 py-1.5 text-sm font-bold text-on-signal hover:bg-signal-strong disabled:opacity-70"
                    >
                      Save changes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOverride(null)
                        setVeraErr(null)
                        setReviewNote(null)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-2xl border border-border px-3 py-1.5 text-sm text-muted hover:bg-surface-elevated"
                    >
                      <Undo2 className="h-4 w-4" /> Revert
                    </button>
                  </>
                )}
              </div>
              {reviewNote && (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-signal-strong">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {reviewNote}
                </p>
              )}
              {veraErr && <p className="mt-2 text-sm text-danger">{veraErr}</p>}
            </div>
          )}

          {/* Managed image studio (Recraft): non-destructive edits + version history. Hidden unless
              a key is configured; edit ops need a file-backed image. */}
          <RecraftEditRow assetId={asset.id} hasFile={!!asset.url} enabled={recraftEnabled} chipCls={chipCls} />
          {recraftEnabled && <AssetVersions assetId={asset.id} />}

          {/* Media manager (Airwaves P2): replace-file for any file-backed asset + a usage map for A/V. */}
          <AssetAvPanel assetId={asset.id} kind={asset.kind} hasFile={!!asset.url} />

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
