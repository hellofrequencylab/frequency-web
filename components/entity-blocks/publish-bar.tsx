'use client'

import { Check, CircleDot, Globe, Loader2 } from 'lucide-react'

// THE PERSISTENT DRAFT / PUBLISH BAR — pinned at the FOOT of the Space page builder's rail (ADR-516 Phase D
// follow-up). Two calm signals in one bar, always in view while an owner edits a Space:
//   • AUTOSAVE STATUS — surfaces the shared store's `saving` flag (edits already autosave on a debounce; this
//     only REFLECTS it, it never adds a save button). "Saving..." while a write is in flight, "Saved" at rest.
//   • PUBLISH — a status + an explicit affordance backed by preferences.profilePublished, NOT a visibility
//     gate. DRAFT reads a primary "Publish your page"; PUBLISHED reads a calm "Your page is live" (a check +
//     muted style) with a quiet Unpublish. Who can SEE the page stays governed by the Space's own visibility.
//
// Stateless + controlled: the builder owns `published` / `saving` / `busy` and the flip handlers; this only
// renders them. Semantic DAWN tokens (no hex), voice canon (no em/en dashes).
export function PublishBar({
  saving,
  published,
  busy,
  error,
  onPublish,
  onUnpublish,
}: {
  /** The store's debounced-save state, surfaced as the autosave indicator (no save button of its own). */
  saving: boolean
  /** Whether preferences.profilePublished is on (defaults true upstream, so a pre-flag Space reads live). */
  published: boolean
  /** A publish / unpublish write is in flight (the control shows a spinner and is disabled). */
  busy: boolean
  /** The last publish-toggle error, shown inline; null when the toggle is clean. */
  error: string | null
  onPublish: () => void
  onUnpublish: () => void
}) {
  return (
    <div className="sticky bottom-0 z-10 space-y-1 rounded-xl border border-border bg-surface/95 px-3 py-2 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        {/* Autosave status — reflects the store's saving flag; role=status so an AT hears it settle. */}
        {saving ? (
          <span className="flex items-center gap-1 text-2xs text-subtle" role="status" aria-live="polite">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving...
          </span>
        ) : (
          <span className="flex items-center gap-1 text-2xs text-subtle" role="status" aria-live="polite">
            <Check className="h-3 w-3 text-success" aria-hidden /> Saved
          </span>
        )}

        {/* Publish control — draft shows the primary action, live shows a calm status + a quiet Unpublish. */}
        {published ? (
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-2xs font-semibold text-success">
              <Check className="h-3.5 w-3.5" aria-hidden /> Your page is live
            </span>
            <button
              type="button"
              onClick={onUnpublish}
              disabled={busy}
              className="rounded-md px-1.5 py-1 text-2xs font-medium text-subtle transition-colors hover:text-text disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : 'Unpublish'}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={onPublish}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-strong disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Globe className="h-3.5 w-3.5" aria-hidden />
            )}
            Publish your page
          </button>
        )}
      </div>

      {/* A draft reads as a quiet status under the bar. Kept honest: this flag is a marker, NOT a visibility
          gate (who sees the page stays with the Space's visibility), so the cue says "not published", not
          "hidden". */}
      {!published && !error && (
        <p className="flex items-center gap-1 text-3xs text-subtle">
          <CircleDot className="h-2.5 w-2.5" aria-hidden /> Not published yet.
        </p>
      )}
      {error && (
        <p className="text-3xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
