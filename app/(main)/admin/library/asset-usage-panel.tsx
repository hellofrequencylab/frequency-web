'use client'

// "Used on N pages" in the Loom asset detail drawer (PROG-D4, ADR-1502): the read surface of the
// usage index. Fetched on drawer open through the Studio-gated action, like the Airwaves panel
// beside it. Three states, and the third is the one that matters: loading, a count with links,
// and COULD NOT CHECK. A failed read never renders as "not used": that is how the previous
// usage table died (ADR-979), and it is the difference between an operator deleting an asset
// that is on nineteen Space profiles and an operator being told to try again.
//
// GLOBAL SWAP (LIVE-451, ADR-1560) sits under the list, and only when there is a list: "Swap
// everywhere" opens the one Loom picker, and the chosen asset takes this one's place in every
// document the index named. The count re-reads afterwards, so the panel shows what the index
// says now, never what the swap claims.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, LayoutTemplate, Loader2 } from 'lucide-react'
import { LoomPicker, type LoomAssetPick } from '@/components/loom/loom-picker'
import type { AssetSwapResult, AssetUsageResult } from '@/lib/library/usage'
import { getLibraryAssetUsage, swapLibraryAssetEverywhere } from './usage-actions'

export function usageHeadline(result: AssetUsageResult): string {
  if (!result.ok) return 'Could not check where this is used.'
  if (result.pages === 0) return 'Not placed on any page yet.'
  const pages = `${result.pages} page${result.pages === 1 ? '' : 's'}`
  const refs = result.refs === result.pages ? '' : ` (${result.refs} placements)`
  return `Used on ${pages}${refs}.`
}

/** What the panel says after a swap. Exported for the test; no I/O. */
export function swapNote(result: AssetSwapResult): string {
  if (!result.ok) return result.error
  if (result.documents === 0) return 'Nothing to swap: this asset is not placed anywhere.'
  const refs = `${result.refs} placement${result.refs === 1 ? '' : 's'}`
  const docs = `${result.documents} document${result.documents === 1 ? '' : 's'}`
  return `Swapped ${refs} across ${docs}.`
}

export function AssetUsagePanel({ assetId, kind }: { assetId: string; kind?: string }) {
  const [state, setState] = useState<{ id: string; version: number; result: AssetUsageResult } | null>(null)
  const [version, setVersion] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null)
  const loading = state?.id !== assetId || state.version !== version

  useEffect(() => {
    let live = true
    getLibraryAssetUsage(assetId)
      .then((result) => {
        if (live) setState({ id: assetId, version, result })
      })
      .catch((e: unknown) => {
        if (live) setState({ id: assetId, version, result: { ok: false, error: e instanceof Error ? e.message : 'failed' } })
      })
    return () => {
      live = false
    }
  }, [assetId, version])

  const result = loading ? null : state?.result ?? null

  const onPick = (pick: LoomAssetPick) => {
    if (!pick.assetId) {
      setNote({ text: 'Pick a Loom asset. A site icon has no library row to point pages at.', ok: false })
      return
    }
    if (pick.assetId === assetId) {
      setNote({ text: 'That is the same asset. Pick a different one.', ok: false })
      return
    }
    setSwapping(true)
    setNote(null)
    swapLibraryAssetEverywhere(assetId, pick.assetId)
      .then((out) => {
        setNote({ text: swapNote(out), ok: out.ok })
        if (out.ok && out.documents > 0) setVersion((v) => v + 1)
      })
      .catch((e: unknown) => setNote({ text: e instanceof Error ? e.message : 'Swap failed.', ok: false }))
      .finally(() => setSwapping(false))
  }

  return (
    <div className="rounded-card border border-border bg-surface-elevated/50 p-3" data-testid="asset-usage">
      <p className="mb-2 flex items-center gap-1.5 eyebrow text-subtle">
        <LayoutTemplate className="h-3.5 w-3.5" aria-hidden /> Where this is placed
      </p>
      {!result ? (
        <p className="text-meta text-subtle">Checking…</p>
      ) : (
        <>
          <p className={`text-meta ${result.ok ? 'text-muted' : 'text-danger'}`}>{usageHeadline(result)}</p>
          {result.ok && result.places.length > 0 && (
            <>
              <ul className="mt-2 space-y-1.5">
                {result.places.map((p) => (
                  <li key={p.key} className="flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-1.5">
                    {p.href ? (
                      <Link href={p.href} className="block min-w-0 flex-1 truncate text-body-sm font-semibold text-text hover:underline">
                        {p.label}
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-text">{p.label}</span>
                    )}
                    <span className="shrink-0 text-2xs text-muted">
                      {p.live ? 'live' : 'draft'}
                      {p.hits > 1 ? ` · ${p.hits}×` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <button
                  type="button"
                  disabled={swapping}
                  onClick={() => setPickerOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-border px-3 py-1.5 text-body-sm text-text hover:bg-surface-elevated disabled:opacity-60"
                >
                  {swapping ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowLeftRight className="h-4 w-4" aria-hidden />}
                  {swapping ? 'Swapping…' : 'Swap everywhere'}
                </button>
                <p className="mt-1 text-2xs text-muted">
                  Every place above gets the asset you pick instead of this one. Swap back to undo.
                </p>
              </div>
            </>
          )}
        </>
      )}
      {note && <p className={`mt-2 text-meta ${note.ok ? 'text-muted' : 'text-danger'}`}>{note.text}</p>}
      <LoomPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectAsset={onPick}
        title="Swap for which asset?"
        kinds={kind ? [kind] : undefined}
      />
    </div>
  )
}
