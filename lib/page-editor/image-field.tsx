'use client'

import { useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { LoomPicker } from '@/components/loom/loom-picker'
import { assetRefUrl, type AssetValue } from '@/lib/library/asset-ref'

// Custom Puck field: choose an image from the Loom (browse your library, or upload into it there). The Loom
// is the only image picker here (owner directive) — no file dialog, no paste-a-URL box.
//
// STORED SHAPE (PROG-D2, ADR-1130): a pick with a library row behind it stores an AssetRef
// ({ assetId, url }) — the reference plus its cached URL — so a later edit/version of the asset can
// re-resolve without re-saving the page. A legacy document's bare URL string stays legal forever; this
// field renders either via assetRefUrl. Block renderers never see the object: the BlockRender walk
// unwraps every ref to its URL string before render.
export function ImageField({
  value,
  onChange,
}: {
  value?: AssetValue
  onChange: (value: AssetValue) => void
}) {
  const [open, setOpen] = useState(false)
  const url = assetRefUrl(value)

  return (
    <div className="space-y-2">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full max-h-40 object-cover rounded-md border border-border" />
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-body-sm hover:bg-surface-elevated"
        >
          <ImagePlus className="w-3.5 h-3.5" aria-hidden /> {url ? 'Change image' : 'Choose an image'}
        </button>
        {url && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Remove image"
            className="shrink-0 rounded-md border border-border px-2 py-1.5 text-subtle transition-colors hover:text-danger"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        )}
      </div>
      <LoomPicker
        open={open}
        onClose={() => setOpen(false)}
        onSelectAsset={(pick) => onChange(pick.assetId ? { assetId: pick.assetId, url: pick.url } : pick.url)}
        title="Choose an image"
        kinds={['image']}
      />
    </div>
  )
}
