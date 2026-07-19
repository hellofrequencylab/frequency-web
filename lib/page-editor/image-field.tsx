'use client'

import { useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { LoomPicker } from '@/components/loom/loom-picker'

// Custom Puck field: choose an image from the Loom (browse your library + upload multi / drag-drop),
// or paste a URL. The Loom popup replaces the bare file input; the picked URL is written straight into
// the Puck data via onChange (the editor persists the whole tree on save).
export function ImageField({
  value,
  onChange,
}: {
  value?: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="w-full max-h-40 object-cover rounded-md border border-border" />
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Image URL"
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-sm hover:bg-surface-elevated"
        >
          <ImagePlus className="w-3.5 h-3.5" /> Choose
        </button>
      </div>
      <LoomPicker open={open} onClose={() => setOpen(false)} onSelect={(url) => onChange(url)} title="Choose an image" />
    </div>
  )
}
