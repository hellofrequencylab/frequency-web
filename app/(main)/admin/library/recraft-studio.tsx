'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wand2, Loader2, Wand, Eraser, Shapes, History, RotateCcw, Palette, Trash2 } from 'lucide-react'
import {
  generateWithRecraft,
  recraftEditAsset,
  listAssetVersions,
  rollbackAssetVersion,
  listBrandStyles,
  deleteBrandStyle,
  type RecraftOp,
} from './recraft-actions'
import type { BrandStyle } from '@/lib/library/styles'

const inputCls = 'w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm'

// "Create with the Image Studio" — generate icon sets / graphics / trophies via Recraft (managed
// image + vector engine). Hidden entirely unless a key is configured (enabled prop).
export function RecraftPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [lane, setLane] = useState<'vector' | 'raster'>('vector')
  const [count, setCount] = useState(1)
  const [styleId, setStyleId] = useState('')
  const [styles, setStyles] = useState<BrandStyle[]>([])
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Load the space's trained brand styles so they can be picked for a matching set.
  useEffect(() => {
    if (!enabled) return
    let live = true
    listBrandStyles().then((s) => live && setStyles(s)).catch(() => {})
    return () => {
      live = false
    }
  }, [enabled])

  if (!enabled) return null

  // Only styles trained for the active lane apply (a vector style can't condition a raster gen).
  const laneStyles = styles.filter((s) => s.lane === lane)

  function generate() {
    if (!prompt.trim()) return
    setErr(null)
    setMsg(null)
    start(async () => {
      const res = await generateWithRecraft({ prompt, lane, count, styleId: styleId || undefined })
      if ('error' in res) setErr(res.error)
      else {
        setMsg(`Generated ${res.count} ${lane === 'vector' ? 'vector' : 'image'}${res.count === 1 ? '' : 's'}.`)
        setPrompt('')
        router.refresh()
      }
    })
  }

  function forgetStyle(id: string) {
    start(async () => {
      await deleteBrandStyle(id)
      const s = await listBrandStyles()
      setStyles(s)
      if (styleId === id) setStyleId('')
    })
  }

  return (
    <details className="mb-6 rounded-2xl border border-border bg-surface-elevated/50 p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-text">
        <Wand2 className="h-4 w-4 text-primary-strong" aria-hidden />
        Generate with the Image Studio
      </summary>
      <div className="mt-4 space-y-3">
        <div className="inline-flex rounded-2xl border border-border p-0.5">
          {(['vector', 'raster'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLane(l)}
              aria-pressed={lane === l}
              className={`rounded-[14px] px-3 py-1.5 text-sm font-semibold transition-colors ${
                lane === l ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-elevated'
              }`}
            >
              {l === 'vector' ? 'Vector (icons/SVG)' : 'Raster (trophies/art)'}
            </button>
          ))}
        </div>
        <textarea
          className={inputCls}
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            lane === 'vector'
              ? 'e.g. a set of flat line icons: compass, book, flame — warm amber, minimal'
              : 'e.g. a warm flat gold trophy badge with a laurel, soft shadows'
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-muted">
            Count
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="rounded-xl border border-border bg-surface px-2 py-1 text-sm"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {/* Brand style — condition the whole set on a trained house look (ADR-489). */}
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <Palette className="h-4 w-4" aria-hidden /> Style
            <select
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
              className="rounded-xl border border-border bg-surface px-2 py-1 text-sm"
            >
              <option value="">Base ({lane})</option>
              {laneStyles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={generate}
            disabled={busy || !prompt.trim()}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary-hover disabled:opacity-70"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {busy ? 'Generating…' : 'Generate'}
          </button>
          {msg && <span className="text-sm text-signal-strong">{msg}</span>}
        </div>

        {/* Trained styles list + how to make one. */}
        <div className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-subtle">
          {laneStyles.length > 0 ? (
            <ul className="mb-1.5 flex flex-wrap gap-1.5">
              {laneStyles.map((s) => (
                <li key={s.id} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-0.5 text-text">
                  <Palette className="h-3 w-3 text-primary-strong" /> {s.name}
                  <button
                    type="button"
                    onClick={() => forgetStyle(s.id)}
                    aria-label={`Forget style ${s.name}`}
                    className="ml-0.5 text-subtle hover:text-danger"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <span>
            <b className="font-semibold text-text">Train a house style:</b> select 1–5 {lane} images in the grid below, then use{' '}
            <b className="font-semibold text-text">Train style</b> in the selection bar. Every generation with that style picked will match the set.
          </span>
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </details>
  )
}

// Recraft edit ops for a file-backed asset (in the detail drawer). Each op is non-destructive — it
// snapshots a version first (see AssetVersions). Hidden unless the studio is enabled + the asset has
// a file URL.
export function RecraftEditRow({
  assetId,
  hasFile,
  enabled,
  chipCls,
}: {
  assetId: string
  hasFile: boolean
  enabled: boolean
  chipCls: string
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  if (!enabled || !hasFile) return null

  function run(op: RecraftOp, prompt?: string) {
    setErr(null)
    start(async () => {
      const res = await recraftEditAsset({ assetId, op, prompt })
      if ('error' in res) setErr(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
        <Wand className="h-3.5 w-3.5" /> Image studio {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => run('vectorize')} className={chipCls}>
          <Shapes className="h-4 w-4" /> Vectorize
        </button>
        <button type="button" disabled={busy} onClick={() => run('remove-bg')} className={chipCls}>
          <Eraser className="h-4 w-4" /> Remove BG
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const p = window.prompt('Describe the variation (what to change)')
            if (p && p.trim()) run('variation', p.trim())
          }}
          className={chipCls}
        >
          <Wand2 className="h-4 w-4" /> Variation
        </button>
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
    </div>
  )
}

// Version history for an asset — non-destructive editing's payoff: see past states, restore any.
export function AssetVersions({ assetId }: { assetId: string }) {
  const router = useRouter()
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof listAssetVersions>>>([])
  const [loading, setLoading] = useState(true)
  const [busy, start] = useTransition()

  useEffect(() => {
    let live = true
    listAssetVersions(assetId)
      .then((v) => live && setVersions(v))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [assetId])

  if (loading) return null
  if (versions.length === 0) return null

  function restore(versionId: string) {
    start(async () => {
      const res = await rollbackAssetVersion(assetId, versionId)
      if (!('error' in res)) {
        const v = await listAssetVersions(assetId)
        setVersions(v)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
        <History className="h-3.5 w-3.5" /> Versions {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {versions.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-text">
              v{v.version}
              {v.note ? ` · ${v.note}` : ''}
              {v.isCurrent ? ' · current' : ''}
            </span>
            {!v.isCurrent && (
              <button
                type="button"
                disabled={busy}
                onClick={() => restore(v.id)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text hover:bg-surface-elevated disabled:opacity-70"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
