'use client'

// The Loom media-manager panel (Airwaves P2, ADR-608 §7e). Rendered in the asset detail drawer for a
// file-backed asset. Two capabilities that turn the Loom into a media manager:
//   1. Replace file — swap the underlying file while keeping the SAME asset id, so every Recording /
//      attachment / block that references it follows the new file (replaceLibraryAssetFile versions the old).
//   2. Where is this used — for an audio/video asset, the Recordings that reference it and where they play
//      (getLoomAssetUsage via the janitor-gated usage route).
// Image behavior is intact: replace works for images too; the usage section only shows for A/V.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Radio, Loader2 } from 'lucide-react'
import type { AssetUsage } from '@/lib/airwaves/asset-usage'
import { replaceLibraryAssetFile } from './replace-actions'

export function AssetAvPanel({
  assetId,
  kind,
  hasFile,
}: {
  assetId: string
  kind: string
  hasFile: boolean
}) {
  const router = useRouter()
  const isAv = kind === 'audio' || kind === 'video'
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<AssetUsage | null>(null)
  const [loadingUsage, setLoadingUsage] = useState(isAv)

  useEffect(() => {
    if (!isAv) return
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the loading state while (re)fetching usage for this asset
    setLoadingUsage(true)
    fetch(`/api/airwaves/assets/${encodeURIComponent(assetId)}/usage`, {
      headers: { accept: 'application/json' },
    })
      .then((r) => (r.ok ? (r.json() as Promise<AssetUsage>) : Promise.reject(new Error('bad response'))))
      .then((u) => {
        if (live) setUsage(u)
      })
      .catch(() => {
        if (live) setUsage(null)
      })
      .finally(() => {
        if (live) setLoadingUsage(false)
      })
    return () => {
      live = false
    }
  }, [assetId, isAv])

  function replace(file: File) {
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    startTransition(async () => {
      const res = await replaceLibraryAssetFile(assetId, fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    })
  }

  if (!hasFile) return null

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface-elevated/50 p-3">
      {/* Replace file */}
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,audio/*,video/*"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) replace(f)
          }}
          className="hidden"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-2xl border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-elevated disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {pending ? 'Replacing…' : 'Replace file'}
        </button>
        <p className="mt-1 text-2xs text-subtle">
          Swaps the file and keeps every reference. The old file is saved as a version.
        </p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>

      {/* Where is this used (A/V only) */}
      {isAv && (
        <div className="border-t border-border pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
            <Radio className="h-3.5 w-3.5" aria-hidden /> Where this is used
          </p>
          {loadingUsage ? (
            <p className="text-xs text-subtle">Checking…</p>
          ) : !usage || usage.recordings.length === 0 ? (
            <p className="text-xs text-subtle">Not used in any recording yet.</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted">
                Used in {usage.totalPlaces} place{usage.totalPlaces === 1 ? '' : 's'} across{' '}
                {usage.recordings.length} recording{usage.recordings.length === 1 ? '' : 's'}.
              </p>
              <ul className="space-y-1.5">
                {usage.recordings.map((r) => (
                  <li key={r.recordingId} className="rounded-lg border border-border bg-surface px-2.5 py-1.5">
                    <span className="text-sm font-semibold text-text">{r.title}</span>
                    <span className="ml-1.5 text-2xs text-subtle">{r.mediaKind}</span>
                    {(r.hosts.length > 0 || r.isEpisode) && (
                      <p className="mt-0.5 text-2xs text-subtle">
                        {[...(r.isEpisode ? ['Show episode'] : []), ...r.hosts].join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
