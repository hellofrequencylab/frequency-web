// No 'use client' needed: this wrapper only composes <Link>, so it stays in the
// server tree and is not pulled into the client bundle of the pages that mount it.
import Link from 'next/link'
import { Plus } from 'lucide-react'

// "Create a practice" — opens the guided builder at /practices/new (ADR-358), the atom-level twin
// of New Journey. Vera's short Spark wizard drafts the whole Practice, then creating it makes the
// row and drops you into the full editor; nothing persists until you commit a reviewed name
// (deferred creation), so pressing this never leaves an untitled draft behind. Uniform filled
// button by default, matching New Journey and the other create entry points.
//
// 🔴 AUTHORING A PRACTICE IS FREE (LIVE-222 / LIVE-409). This used to wrap the link in the crew
// upgrade gate (reason "create-practice"). practice.create is granted to every signed-in member
// in lib/core/capabilities.ts; the quantity cap lives at publish (the `practice_publish` meter),
// never on the door. Sign-in is still required — call sites render this only when signed in.
export function NewPracticeButton({
  className,
  label = 'Create a practice',
}: {
  className?: string
  label?: string
  /** @deprecated Authoring a Practice is free (LIVE-409). Drop it at the call sites. */
  canCreate?: boolean
}) {
  const cls =
    className ??
    'inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover'
  return (
    <Link href="/practices/new" className={cls}>
      <Plus className="h-4 w-4" /> {label}
    </Link>
  )
}
