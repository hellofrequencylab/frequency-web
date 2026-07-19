'use client'

import { useRef, useState } from 'react'
import { ImagePlus, X, GripVertical, Plus } from 'lucide-react'
import { LoomPicker } from '@/components/loom/loom-picker'

// A Puck custom field for the Image block's GALLERY mode: an ORDERED list of images. Images are added
// from the Loom (browse your library + upload multi / drag-drop, via the shared picker) or by URL,
// removed, and reordered by drag. The stored value is `{ src: string }[]`, so the block renders the
// images in the operator's chosen order.

export type GalleryImage = { src: string }

function GalleryImagesField({
  value,
  onChange,
}: {
  value?: GalleryImage[]
  onChange: (value: GalleryImage[]) => void
}) {
  const images = value ?? []
  const [url, setUrl] = useState('')
  const [loomOpen, setLoomOpen] = useState(false)
  const dragIndex = useRef<number | null>(null)

  function addUrls(srcs: string[]) {
    if (srcs.length === 0) return
    onChange([...images, ...srcs.map((src) => ({ src }))])
  }

  function addUrl() {
    const src = url.trim()
    if (!src) return
    addUrls([src])
    setUrl('')
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
              key={`${img.src}-${i}`}
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
              <img src={img.src} alt="" className="h-full w-full cursor-grab object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove image"
                className="absolute right-1 top-1 rounded-md bg-canvas/90 p-0.5 text-subtle opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
              <GripVertical
                className="absolute left-1 top-1 h-3.5 w-3.5 text-white/80 opacity-0 drop-shadow group-hover:opacity-100"
                aria-hidden
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addUrl()
            }
          }}
          placeholder="Image URL"
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={addUrl}
          disabled={!url.trim()}
          aria-label="Add image by URL"
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-sm transition-colors hover:bg-surface-elevated disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add
        </button>
      </div>

      <button
        type="button"
        onClick={() => setLoomOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-2 text-sm text-muted transition-colors hover:border-border-strong hover:bg-surface"
      >
        <ImagePlus className="h-3.5 w-3.5" aria-hidden />
        Choose from your Loom
      </button>
      <LoomPicker open={loomOpen} onClose={() => setLoomOpen(false)} multiple onSelectMany={addUrls} title="Add images" />
    </div>
  )
}

/** The Puck custom field: an ordered gallery image list (Loom multi-pick + URL + reorder). */
export const galleryImagesField = {
  type: 'custom' as const,
  label: 'Gallery images',
  render: ({ value, onChange }: { value?: GalleryImage[]; onChange: (v: GalleryImage[]) => void }) => (
    <GalleryImagesField value={value} onChange={onChange} />
  ),
}
