'use client'

import { useRef, useState } from 'react'
import { ImagePlus, X, GripVertical } from 'lucide-react'
import { LoomPicker, type LoomAssetPick } from '@/components/loom/loom-picker'
import { assetRefUrl, type AssetValue } from '@/lib/library/asset-ref'

// A Puck custom field for the Image block's GALLERY mode: an ORDERED list of images. Images are added from
// the Loom (browse your library, or upload into it there, via the shared picker), removed, and reordered by
// drag. The Loom is the only way in (owner directive): no file dialog, no paste-a-URL box. The stored value
// is `{ src }[]` where each src is an AssetRef ({ assetId, url }) for a library pick or a legacy URL string
// (ADR-1130); the block's renderer still receives plain strings via the BlockRender unwrap.

export type GalleryImage = { src: AssetValue }

function GalleryImagesField({
  value,
  onChange,
}: {
  value?: GalleryImage[]
  onChange: (value: GalleryImage[]) => void
}) {
  const images = value ?? []
  const [loomOpen, setLoomOpen] = useState(false)
  const dragIndex = useRef<number | null>(null)

  function addPicks(picks: LoomAssetPick[]) {
    if (picks.length === 0) return
    onChange([
      ...images,
      ...picks.map((p) => ({ src: p.assetId ? { assetId: p.assetId, url: p.url } : p.url })),
    ])
  }

  function remove(i: number) {
    onChange(images.filter((_, idx) => idx !== i))
  }

  function reorder(from: number, to: number) {
    if (from === to) return
    const next = [...images]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-1.5">
          {images.map((img, i) => (
            <li
              key={`${assetRefUrl(img.src)}-${i}`}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex.current !== null) reorder(dragIndex.current, i)
                dragIndex.current = null
              }}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- gallery thumbnail in the editor, not a build-time asset */}
              <img src={assetRefUrl(img.src)} alt="" className="h-full w-full cursor-grab object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove image"
                className="absolute right-1 top-1 rounded-md bg-canvas/90 p-0.5 text-subtle opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
              <GripVertical
                className="absolute left-1 top-1 h-3.5 w-3.5 text-on-media/80 opacity-0 drop-shadow group-hover:opacity-100"
                aria-hidden
              />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setLoomOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-2 text-body-sm text-muted transition-colors hover:border-border-strong hover:bg-surface"
      >
        <ImagePlus className="h-3.5 w-3.5" aria-hidden />
        Choose from your Loom
      </button>
      <LoomPicker
        open={loomOpen}
        onClose={() => setLoomOpen(false)}
        multiple
        onSelectManyAssets={addPicks}
        title="Add images"
        kinds={['image']}
      />
    </div>
  )
}

/** The Puck custom field: an ordered gallery image list (Loom multi-pick + drag to reorder). */
export const galleryImagesField = {
  type: 'custom' as const,
  label: 'Gallery images',
  render: ({ value, onChange }: { value?: GalleryImage[]; onChange: (v: GalleryImage[]) => void }) => (
    <GalleryImagesField value={value} onChange={onChange} />
  ),
}
