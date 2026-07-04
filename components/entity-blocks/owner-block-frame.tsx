'use client'

import Link from 'next/link'
import { Pencil } from 'lucide-react'

// THE OWNER-ONLY CLICK-TO-EDIT FRAME for a profile layout block (Spaces item 6). Wraps ONE rendered
// block for the person who owns the surface and overlays a quiet hover "edit" pencil that deep-links to
// that surface's EXISTING layout editor (the grid editor for a Space, the profile-preview editor for a
// member) — no inline editor, no new state. A visitor or non-owner never gets this frame at all (the
// renderers only wrap when an editHref is passed), so their render stays byte-identical to before.
//
// FAIL-SAFE COLLAPSE (load-bearing): every block renders inside an `empty:hidden` <section>, so a block
// with no data honestly collapses to nothing. `[&:not(:has(section:not(:empty)))]:hidden` hides THIS
// frame in the same case, so a collapsed block never leaves a phantom pencil floating over blank space
// (`:has` is already in use in-repo, e.g. components/cards/entity-card.tsx).
export function OwnerBlockFrame({
  blockId,
  editHref,
  label,
  children,
}: {
  /** The block/registry id this frame wraps (the stable anchor id: `about`, `links`, …). */
  blockId: string
  /** Where the pencil links — the surface's existing layout editor. */
  editHref: string
  /** A human label for the pencil's accessible name; defaults to the block id. */
  label?: string
  children: React.ReactNode
}) {
  return (
    <div className="group relative [&:not(:has(section:not(:empty)))]:hidden">
      {children}
      <Link
        href={editHref}
        aria-label={`Edit ${label ?? blockId}`}
        className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-muted opacity-0 shadow-sm transition hover:text-text focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )
}
