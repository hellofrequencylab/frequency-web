'use client'

// "Used on N pages" in the Loom asset detail drawer (PROG-D4, ADR-1502): the read surface of the
// usage index. Fetched on drawer open through the Studio-gated action, like the Airwaves panel
// beside it. Three states, and the third is the one that matters: loading, a count with links,
// and COULD NOT CHECK. A failed read never renders as "not used": that is how the previous
// usage table died (ADR-979), and it is the difference between an operator deleting an asset
// that is on nineteen Space profiles and an operator being told to try again.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LayoutTemplate } from 'lucide-react'
import type { AssetUsageResult } from '@/lib/library/usage'
import { getLibraryAssetUsage } from './usage-actions'

export function usageHeadline(result: AssetUsageResult): string {
  if (!result.ok) return 'Could not check where this is used.'
  if (result.pages === 0) return 'Not placed on any page yet.'
  const pages = `${result.pages} page${result.pages === 1 ? '' : 's'}`
  const refs = result.refs === result.pages ? '' : ` (${result.refs} placements)`
  return `Used on ${pages}${refs}.`
}

export function AssetUsagePanel({ assetId }: { assetId: string }) {
  const [state, setState] = useState<{ id: string; result: AssetUsageResult } | null>(null)
  const loading = state?.id !== assetId

  useEffect(() => {
    let live = true
    getLibraryAssetUsage(assetId)
      .then((result) => {
        if (live) setState({ id: assetId, result })
      })
      .catch((e: unknown) => {
        if (live) setState({ id: assetId, result: { ok: false, error: e instanceof Error ? e.message : 'failed' } })
      })
    return () => {
      live = false
    }
  }, [assetId])

  const result = loading ? null : state?.result ?? null

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated/50 p-3" data-testid="asset-usage">
      <p className="mb-2 flex items-center gap-1.5 eyebrow text-subtle">
        <LayoutTemplate className="h-3.5 w-3.5" aria-hidden /> Where this is placed
      </p>
      {!result ? (
        <p className="text-meta text-subtle">Checking…</p>
      ) : (
        <>
          <p className={`text-meta ${result.ok ? 'text-muted' : 'text-danger'}`}>{usageHeadline(result)}</p>
          {result.ok && result.places.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {result.places.map((p) => (
                <li key={p.key} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5">
                  {p.href ? (
                    <Link href={p.href} className="min-w-0 flex-1 truncate text-body-sm font-semibold text-text hover:underline">
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
          )}
        </>
      )}
    </div>
  )
}
