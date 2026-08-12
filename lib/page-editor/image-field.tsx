'use client'

import { useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { LoomPicker } from '@/components/loom/loom-picker'

// Custom Puck field: choose an image from the Loom (browse your library, or upload into it there). The Loom
// is the only image picker here (owner directive) — no file dialog, no paste-a-URL box. The picked URL is
// written straight into the Puck data via onChange (the editor persists the whole tree on save).
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
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-body-sm hover:bg-surface-elevated"
        >
          <ImagePlus className="w-3.5 h-3.5" aria-hidden /> {value ? 'Change image' : 'Choose an image'}
        </button>
        {value && (
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
        onSelect={(url) => onChange(url)}
        title="Choose an image"
        kinds={['image']}
      />
    </div>
  )
}
