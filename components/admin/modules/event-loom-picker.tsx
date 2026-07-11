'use client'

import { useEffect, useState, useTransition } from 'react'
import { ImageIcon, Search, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { listMyLoomImages, addEventImageFromLoom } from '@/app/(main)/events/admin-actions'
import type { LibraryImagePick } from '@/lib/library/store'

// "Select from Loom" for the event image editor. A link under the photos opens a centered popup (the
// shared Dialog) showing the host's Loom images (their space's library plus the shared/public one).
// Picking one copies it into the event gallery (server-side) and hands the new gallery array back to
// the parent, which persists the order. Reuses the shared modal chrome + the Loom search action.
export function EventLoomPicker({
  eventId,
  slug,
  disabled = false,
  onAdded,
}: {
  eventId: string
  slug: string
  disabled?: boolean
  /** The new full gallery path array after the picked image was added. */
  onAdded: (paths: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [items, setItems] = useState<LibraryImagePick[]>([])
  const [loading, startLoad] = useTransition()
  const [adding, setAdding] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Load the Loom grid when the popup opens or the query changes (debounced).
  useEffect(() => {
    if (!open) return
    const handle = setTimeout(() => {
      startLoad(async () => {
        const rows = await listMyLoomImages(q)
        setItems(rows)
      })
    }, 200)
    return () => clearTimeout(handle)
  }, [open, q])

  async function pick(assetId: string) {
    setErr(null)
    setAdding(assetId)
    const res = await addEventImageFromLoom(eventId, slug, assetId)
    setAdding(null)
    if ('error' in res) {
      setErr(res.error)
      return
    }
    onAdded(res.paths)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-50"
      >
        <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Select from Loom
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="Select an image from the Loom" className="max-w-lg">
        <div className="rounded-2xl border border-border bg-canvas p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text">Your Loom</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-lg p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-surface px-2">
            <Search className="h-3.5 w-3.5 text-subtle" aria-hidden />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the Loom"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </div>

          {loading ? (
            <p className="px-1 py-8 text-center text-xs text-subtle">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-1 py-8 text-center text-xs text-subtle">
              No images in your Loom yet. Photos you upload to an event land here for reuse.
            </p>
          ) : (
            <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => pick(it.id)}
                  disabled={adding !== null}
                  title={it.title}
                  className="relative aspect-square overflow-hidden rounded-lg border border-border transition-colors hover:border-primary disabled:opacity-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Loom asset thumbnail in the picker, not a build-time asset */}
                  <img src={it.url} alt={it.alt ?? ''} className="h-full w-full object-cover" />
                  {adding === it.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-3xs font-semibold uppercase tracking-wide text-white">
                      Adding…
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {err && <p className="mt-2 text-xs font-medium text-danger">{err}</p>}
        </div>
      </Dialog>
    </>
  )
}
