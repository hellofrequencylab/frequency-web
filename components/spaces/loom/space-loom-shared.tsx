'use client'

// THE FREQUENCY SHELF of the Space Loom Studio (LIVE-569, ADR-1587). A Space's effective library is its
// own rows plus the Frequency shared library (the root Space's public rows, docs/LIBRARY.md Scoping).
// The Studio's main grid is the Space's own; this shelf is the shared set, badged "Frequency", read
// through the same gated `loomImages` action with `shared: 'only'`. Placing a shared image anywhere
// references the master. "Make it yours" copies it into this Space's own Loom (forkSharedLoomImage,
// which writes parent_id to the master), and the copy joins the main grid, where it can be renamed,
// captioned, retagged or removed without touching the master.
//
// Closed by default and read only when opened, so the Studio's first paint costs nothing extra.
// FAIL-SAFE: a failed read shows an empty shelf with a sentence, never a throw.

import { useEffect, useState, useTransition } from 'react'
import { Loader2, Copy, Check } from 'lucide-react'
import { loomImages, forkSharedLoomImage } from '@/lib/loom/picker-actions'
import type { LoomPickAsset } from '@/lib/library/store'
import { Button } from '@/components/ui/button'

export function SpaceLoomShared({
  spaceId,
  query,
  onForked,
}: {
  spaceId: string
  /** The Studio's search box, so one query searches both shelves. */
  query: string
  /** Hands the new copy to the Studio's own grid. */
  onForked: (asset: LoomPickAsset) => void
}) {
  const [open, setOpen] = useState(false)
  const [assets, setAssets] = useState<LoomPickAsset[] | null>(null)
  const [readFailed, setReadFailed] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [made, setMade] = useState<Record<string, true>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, startLoad] = useTransition()

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      startLoad(async () => {
        try {
          const res = await loomImages(spaceId, { q: query || undefined, kinds: ['image'], shared: 'only' })
          setAssets(res.assets)
          setReadFailed(false)
        } catch {
          setAssets([])
          setReadFailed(true)
        }
      })
    }, 300)
    return () => clearTimeout(t)
  }, [open, query, spaceId])

  const makeYours = async (a: LoomPickAsset) => {
    setError(null)
    setPending(a.id)
    let res: Awaited<ReturnType<typeof forkSharedLoomImage>>
    try {
      res = await forkSharedLoomImage(spaceId, a.id)
    } catch {
      res = { error: 'That copy did not go through. Try again in a moment.' }
    }
    setPending(null)
    if ('error' in res) {
      setError(res.error)
      return
    }
    setMade((prev) => ({ ...prev, [a.id]: true }))
    onForked({
      id: res.id,
      title: a.title,
      url: res.url,
      alt: a.alt,
      kind: 'image',
      generated: a.generated,
      tags: a.tags,
      category: a.category,
      isProtected: false,
      ownedByViewer: true,
    })
  }

  return (
    <details
      className="rounded-card border border-border bg-surface"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer px-4 py-3 text-body-sm font-semibold text-text">
        Frequency library
        <span className="ml-2 text-meta font-normal text-muted">Images Frequency shares with every Space</span>
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-3">
        <p className="text-meta text-muted">
          Place any of these as they are from the image picker. To rename, caption or retag one, make it yours first:
          you get your own copy in this library, and the original stays as it is.
        </p>
        {error && <p className="text-2xs text-danger">{error}</p>}
        {loading || assets === null ? (
          <p className="flex items-center justify-center gap-2 py-10 text-body-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading
          </p>
        ) : assets.length === 0 ? (
          <p className="py-10 text-center text-body-sm text-subtle">
            {readFailed
              ? 'Could not load the Frequency library right now.'
              : query
                ? 'No Frequency images match.'
                : 'Nothing in the Frequency library yet.'}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {assets.map((a) => (
              <li key={a.id} className="relative aspect-square overflow-hidden rounded-card border border-border bg-canvas">
                {/* eslint-disable-next-line @next/next/no-img-element -- Loom asset URL, not a configured next/image domain */}
                <img src={a.url} alt={a.alt ?? a.title} loading="lazy" className="h-full w-full object-cover" />
                <span className="absolute left-1.5 top-1.5 rounded-pill bg-canvas/90 px-1.5 py-0.5 text-2xs font-semibold text-muted lift-1">
                  Frequency
                </span>
                {!a.isProtected && (
                  <div className="absolute inset-x-1.5 bottom-1.5">
                    {made[a.id] ? (
                      <span className="inline-flex w-full items-center justify-center gap-1 rounded-pill bg-canvas/90 px-2 py-1 text-2xs font-semibold text-success">
                        <Check className="h-3 w-3" /> Yours now
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        loading={pending === a.id}
                        disabled={pending !== null}
                        aria-label={`Make ${a.title} yours`}
                        onClick={() => void makeYours(a)}
                      >
                        <Copy className="h-3.5 w-3.5" /> Make it yours
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
