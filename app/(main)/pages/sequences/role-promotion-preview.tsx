'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import type { Walkthrough } from '@/lib/walkthroughs'
import { WalkthroughLightbox } from '@/components/walkthroughs/walkthrough-lightbox'

// Operator preview of a role-promotion tour on /pages/sequences. Opens the SAME
// member-facing lightbox the member sees, in previewOnly mode so finishing doesn't
// record completion or pay zaps for the operator. Reuses the shipped renderer so the
// preview can never drift from what the member gets.

export function RolePromotionPreview({ walkthrough }: { walkthrough: Walkthrough }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden /> Preview
      </button>
      {open && (
        <WalkthroughLightbox walkthrough={walkthrough} previewOnly onClose={() => setOpen(false)} />
      )}
    </>
  )
}
