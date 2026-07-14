'use client'

// Airwaves P3 — cover-art picker for a Show. A thin cousin of the event/email Loom pickers: a button
// opens the shared Dialog onto the Space's Loom images (its own plus the shared/public library), and a
// pick hands the chosen library_assets id + its URL back to the form (stored as the Show's coverAssetId).
// It never uploads or copies bytes — a Show reuses an asset already in the Loom, so the same cover can
// back the feed and the space page. App-chrome tokens only (no hex); voice canon (no em dashes).

import { useEffect, useState, useTransition } from 'react'
import { ImageIcon, Search, Trash2, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import type { LibraryImagePick } from '@/lib/library/store'
import { listShowCoverImagesAction } from './actions'

export interface CoverPick {
  id: string
  url: string
}

export function ShowCoverPicker({
  slug,
  value,
  onChange,
  disabled = false,
}: {
  slug: string
  value: CoverPick | null
  onChange: (pick: CoverPick | null) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [items, setItems] = useState<LibraryImagePick[]>([])
  const [loading, startLoad] = useTransition()

  // Load the Loom grid when the popup opens or the query changes (debounced), newest first.
  useEffect(() => {
    if (!open) return
    const handle = setTimeout(() => {
      startLoad(async () => {
        const rows = await listShowCoverImagesAction(slug, q)
        setItems(rows)
      })
    }, 200)
    return () => clearTimeout(handle)
  }, [open, q, slug])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {value ? (
          <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element -- Loom asset URL, not a build asset */}
            <img src={value.url} alt="" className="h-full w-full object-cover" />
          </span>
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-subtle">
            <ImageIcon className="h-5 w-5" aria-hidden />
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-50"
          >
            <ImageIcon className="h-3.5 w-3.5" aria-hidden /> {value ? 'Change cover' : 'Choose cover art'}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
            </button>
          )}
        </div>
      </div>
      <p className="text-2xs text-subtle">
        Square art works best. Apple and Spotify want at least 1400 by 1400 pixels.
      </p>

      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="Choose cover art from the Loom" className="max-w-lg">
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
            <p className="px-1 py-8 text-center text-xs text-subtle">Loading</p>
          ) : items.length === 0 ? (
            <p className="px-1 py-8 text-center text-xs text-subtle">
              No images in your Loom yet. Add photos through the space, then pick one here.
            </p>
          ) : (
            <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    onChange({ id: it.id, url: it.url })
                    setOpen(false)
                  }}
                  title={it.title}
                  className="relative aspect-square overflow-hidden rounded-lg border border-border transition-colors hover:border-primary"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Loom asset thumbnail in the picker, not a build asset */}
                  <img src={it.url} alt={it.alt ?? ''} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  )
}
