import { Lightbulb } from 'lucide-react'
import type { CircleCallout, CalloutAnchor } from '@/lib/circles/templates'
import { standardCalloutsFor } from '@/lib/circles/templates'

// Edit-mode-only instruction boxes for one builder section. The standard
// best-practice library (lib/circles/templates.ts) PLUS any extras that travelled
// in from the template (draft.editorNotes), filtered to this section's anchor.
// These render ONLY in the builder; they never reach the published Circle.

export function CircleCallouts({
  anchor,
  editorNotes,
}: {
  anchor: CalloutAnchor
  /** The draft's per-template extras (CircleDraft.editorNotes); filtered here. */
  editorNotes: CircleCallout[]
}) {
  const standard = standardCalloutsFor(anchor)
  const extras = editorNotes.filter((c) => c.anchor === anchor)
  const all = [...standard, ...extras]
  if (all.length === 0) return null

  return (
    <div className="space-y-2">
      {all.map((c, i) => (
        <div
          key={`${c.title}-${i}`}
          className="rounded-xl border border-primary/30 bg-primary-bg/20 px-3.5 py-3"
        >
          <p className="flex items-start gap-2 text-sm font-semibold text-text">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            {c.title}
          </p>
          <p className="mt-1 pl-6 text-sm leading-relaxed text-muted">{c.body}</p>
        </div>
      ))}
    </div>
  )
}
