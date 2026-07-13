'use client'

import { Sparkles } from 'lucide-react'

// THE EDIT-MODE NOTICE BANNER. A friendly, always-visible instruction card shown at the TOP of the live
// Space grid while the owner is editing (LiveProfileGrid renders it only when `editable`). It names what the
// two surfaces do — click a block on the page to edit its words and photos, use the right-hand panel to add /
// rearrange / style — so a first-time owner is never lost. Semantic DAWN tokens only (no hex); voice canon
// (docs/CONTENT-VOICE.md): plain, a camp counselor you respect, no em dashes.

export function SpaceEditNotice() {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary-bg/40 px-4 py-3">
      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-text">You&rsquo;re editing your Space</p>
        <p className="text-sm leading-relaxed text-muted">
          Click any block on the page to edit its words and photos. Use the panel on the right to add,
          rearrange, and style your blocks.
        </p>
      </div>
    </div>
  )
}
