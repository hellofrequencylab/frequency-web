'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wand2, Loader2, Wand, Eraser, Shapes, History, RotateCcw } from 'lucide-react'
import {
  recraftEditAsset,
  listAssetVersions,
  rollbackAssetVersion,
  type RecraftOp,
} from './recraft-actions'

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
