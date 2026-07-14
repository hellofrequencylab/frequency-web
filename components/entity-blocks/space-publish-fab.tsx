'use client'

import { Check, Globe, Loader2 } from 'lucide-react'

// THE FLOATING DRAFT / PUBLISH BUTTON for the Space page editor. Unlike the compact rail bar, this is
// pinned to the bottom-right of the PAGE, above everything, and stays put on scroll the whole time an
// owner is in edit mode, so "publish when you're ready" is always one obvious click away. It sits in the
// CONTENT area (clear of the admin rail) by offsetting its right edge by the rail's live width, which the
// app shell publishes as the `--admin-rail-w` CSS variable (0 when the rail is closed / on mobile).
//
// Stateless + controlled: the builder owns `published` / `saving` / `busy` and the flip handlers. Semantic
// DAWN tokens only (no hex), voice canon (no em/en dashes).
export function SpacePublishFab({
  saving,
  published,
  busy,
  error,
  onPublish,
  onUnpublish,
}: {
  /** The store's debounced-save state, surfaced as a small autosave cue (no save button of its own). */
  saving: boolean
  /** Whether preferences.profilePublished is on (defaults true upstream). */
  published: boolean
  /** A publish / unpublish write is in flight (spinner + disabled). */
  busy: boolean
  /** The last publish-toggle error, shown inline; null when clean. */
  error: string | null
  onPublish: () => void
  onUnpublish: () => void
}) {
  return (
    <div
      // Fixed to the viewport bottom-right, offset left of the admin rail so it floats over the page, not
      // the panel. z above the rail so it is never covered.
      className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-1 [right:calc(var(--admin-rail-w,0px)+1.25rem)]"
    >
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface/95 p-2 shadow-xl backdrop-blur">
        {/* Autosave cue — reflects the store's saving flag; role=status so an AT hears it settle. */}
        <span className="hidden items-center gap-1 pl-1 text-2xs text-subtle sm:flex" role="status" aria-live="polite">
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving
            </>
          ) : (
            <>
              <Check className="h-3 w-3 text-success" aria-hidden /> Saved
            </>
          )}
        </span>

        {published ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-xl bg-success-bg px-3 py-2 text-sm font-bold text-success">
              <Check className="h-4 w-4" aria-hidden /> Your page is live
            </span>
            <button
              type="button"
              onClick={onUnpublish}
              disabled={busy}
              className="rounded-xl px-2.5 py-2 text-xs font-semibold text-subtle transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Unpublish'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPublish}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary shadow-sm transition-colors hover:bg-primary-strong disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Globe className="h-4 w-4" aria-hidden />}
            Publish your page
          </button>
        )}
      </div>

      {/* A draft reads as a quiet cue under the button; kept honest (a marker, not a visibility gate). */}
      {!published && !error && (
        <p className="rounded-full bg-surface/90 px-2 py-0.5 text-3xs font-medium text-subtle shadow-sm backdrop-blur">
          Draft, not live yet
        </p>
      )}
      {error && (
        <p className="rounded-full bg-danger-bg px-2 py-0.5 text-3xs font-medium text-danger shadow-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
