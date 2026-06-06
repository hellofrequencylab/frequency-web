'use client'

import { type ReactNode } from 'react'
import { Dialog } from '@/components/ui/dialog'

// Distraction-free overlay for the composer — the shared Dialog shell at the
// composer's width. The composer renders its own chrome inside the slot; the
// overlay grammar (backdrop · ESC · scroll-lock) lives in Dialog now.
export function ComposeLightbox({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <Dialog open onClose={onClose} ariaLabel="Compose a post" className="max-w-2xl">
      {children}
    </Dialog>
  )
}
