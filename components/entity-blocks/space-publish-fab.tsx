'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronUp, Globe, Loader2, Trash2, Undo2 } from 'lucide-react'
import { useProfileLayout } from './profile-layout-context'
import { setUnpublishedWork, UNPUBLISHED_LEAVE_WARNING } from '@/lib/layout/unpublished-work'
import {
  discardSpaceProfileDraft,
  publishSpaceProfileLayout,
  setProfilePublished,
} from '@/app/(main)/spaces/[slug]/settings/profile/actions'

// THE SPACE PAGE PUBLISH BAR. A bottom-docked overlay strip that opens whenever the owner is in live-page
// edit mode. It is rendered by the LiveProfileGrid (the page body), NOT the admin rail: the rail slides in on
// a `transform`, which traps any `position: fixed` descendant inside its box, so a bar rendered there was
// clipped out of view. In the page body there is no transformed ancestor, so `fixed` pins it to the viewport.
//
// It docks to the BOTTOM of the viewport and SPANS the full width, overlaying the admin rail (z above the
// rail's z-50). The interactive cluster is padded clear of the rail via the `--admin-rail-w` variable the app
// shell publishes (0 when the rail is closed / on mobile), so the buttons stay in the content zone while the
// bar still reads across the rail. It does NOT scroll with the page.
//
// Self-contained: it reads the shared space-layout store for the autosave state + undo (the store already
// owns the history stack — this only consumes `undo` / `canUndo`) and calls the owner-gated server actions
// directly. Semantic DAWN tokens only (no hex), voice canon (no em dashes), an aria-live autosave cue.
export function SpacePublishFab({
  slug,
  initialPublished = true,
  hasUnpublishedChanges = false,
  editable = true,
}: {
  /** The Space slug — the owner-gated publish + visibility actions re-check ownership server-side by it. */
  slug: string
  /** The persisted preferences.profilePublished, seeding the "Visible on network" toggle (defaults true). */
  initialPublished?: boolean
  /** The draft differs from what visitors see. Changes ONLY the wording: the bar leads with the fact
   *  that the page has changes nobody else can see yet, instead of the neutral autosave cue. Without
   *  this an owner who had already published read "Draft · Saved" as "live", which is how a card-view
   *  change sat unpublished and was reported as a rendering bug. */
  hasUnpublishedChanges?: boolean
  /** True in live-page edit mode. Seeds whether the bar opens EXPANDED or as the compact pill.
   *  Outside edit mode the bar exists only to say "you have changes nobody else can see yet", so
   *  opening the full strip (Undo, Save draft, Visible on network) over the owner's page on every
   *  ordinary visit would be chrome nobody asked for. Minimized, it is one pill. */
  editable?: boolean
}) {
  const store = useProfileLayout()
  const router = useRouter()
  const [open, setOpen] = useState(editable)
  const [published, setPublished] = useState(initialPublished)
  const [publishBusy, setPublishBusy] = useState(false)
  const [discardBusy, setDiscardBusy] = useState(false)
  const [visibleBusy, setVisibleBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saving = !!store?.saving
  // The DEBOUNCE window too, not just the in-flight save. `saving` only flips once flush() has started,
  // so for ~600ms after every edit the guards below believed there was nothing to lose.
  const dirty = !!store?.dirty
  const canUndo = !!store?.canUndo

  // ── LEAVING WITH WORK NOBODY ELSE CAN SEE ───────────────────────────────────────────────
  // The owner's report: edits sat unpublished for days and read as a rendering bug, because the
  // page looked finished and nothing said otherwise. Autosave makes that worse, not better —
  // "Draft · Saved" is literally true and reads as "live".
  //
  // THREE distinct states, and the warning covers all three:
  //   dirty                 -> an edit landed, its debounced save has not started yet
  //   saving                -> bytes in flight, closing now loses the last edit outright
  //   hasUnpublishedChanges -> saved safely, but no visitor can see it until Publish
  //
  // 🔴 `dirty` was missing, and `saving` does not cover it: setSaving(true) happens inside flush(),
  // which the debounce delays by ~600ms. Every keystroke therefore opened a window where the page had
  // unpersisted work and none of the guards below knew it. `seed` deliberately does not set it, so
  // merely opening your own page never arms a prompt.
  //
  // Same shape as the repo's other editors (admin/walkthroughs, pages/splash): preventDefault +
  // returnValue is all a browser honours. The string is ignored by every modern browser, which is
  // exactly why the in-page copy below has to carry the message too — this dialog can only ask
  // "leave?", it cannot explain why.
  const unsavedOrUnpublished = saving || dirty || hasUnpublishedChanges

  // Publish the same fact to the app shell, whose admin-bar close button lives in a different React
  // tree and cannot read this store. Cleared on unmount so navigating away does not leave a stale
  // flag warning about a page the operator already left.
  useEffect(() => {
    setUnpublishedWork(!!unsavedOrUnpublished)
    return () => setUnpublishedWork(false)
  }, [unsavedOrUnpublished])

  useEffect(() => {
    if (!unsavedOrUnpublished) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [unsavedOrUnpublished])

  // ── LEAVING THE PAGE THE WAY PEOPLE ACTUALLY LEAVE IT ───────────────────────────────────
  //
  // 🔴 `beforeunload` above covers only HARD unloads: reload, tab close, typing a new URL. It does
  // NOT fire on an App Router client transition, which is how an owner actually leaves their Space
  // page — a click on the nav rail, a Space header tab, any <Link>. So the guard that exists to stop
  // a draft being forgotten was silent on the majority path, which is exactly the "it sat
  // unpublished for days" report it was written for.
  //
  // Intercepted at the DOCUMENT in the CAPTURE phase rather than per-<Link>, so it covers every
  // in-app anchor including ones rendered by components this file knows nothing about, and it runs
  // before the router's own handler gets the click. Only same-origin, plain left-clicks are
  // guarded: a modified click (new tab), a `target` that is not this frame, a download, and any
  // non-http scheme all leave this page open and lose nothing.
  //
  // ⚠️ Browser BACK is still unguarded, and cannot be guarded without pushing a decoy history entry
  // (which breaks the back button in its own way). No work is lost either way: the layout store
  // flushes its pending save on unmount.
  useEffect(() => {
    if (!unsavedOrUnpublished) return
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.hasAttribute('download')) return
      if (anchor.target && anchor.target !== '_self') return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      // A same-page hash jump is not leaving.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      if (window.confirm(UNPUBLISHED_LEAVE_WARNING)) return
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [unsavedOrUnpublished])

  // Promote the draft onto the published node (go live now), then CLOSE the bar.
  async function onPublish() {
    setError(null)
    setPublishBusy(true)
    const res = await publishSpaceProfileLayout(slug)
    setPublishBusy(false)
    if (res?.error) {
      setError(res.error)
      return
    }
    setPublished(true)
    setOpen(false)
  }

  // Throw the draft away and go back to what visitors see. DESTRUCTIVE and irreversible (the draft is
  // deleted server-side), so it confirms first. `router.refresh()` re-runs the server component that
  // computed hasUnpublishedChanges, so the bar and the warnings clear in the same beat.
  async function onDiscard() {
    if (!window.confirm('Discard your unpublished changes and go back to the page visitors see? This cannot be undone.'))
      return
    setError(null)
    setDiscardBusy(true)
    const res = await discardSpaceProfileDraft(slug)
    setDiscardBusy(false)
    if (res?.error) {
      setError(res.error)
      return
    }
    router.refresh()
  }

  // Persist-and-step-away: autosave already writes the draft on every edit, so this just confirms + minimizes
  // (the previous page stays live). Minimizing leaves a small pill to reopen the bar.
  function onSaveDraft() {
    setError(null)
    setOpen(false)
  }

  // Flip preferences.profilePublished — the network-visibility control (owner-gated server-side).
  async function onToggleVisible() {
    const next = !published
    setError(null)
    setVisibleBusy(true)
    const res = await setProfilePublished(slug, next)
    setVisibleBusy(false)
    if (res?.error) setError(res.error)
    else setPublished(next)
  }

  if (!store) return null

  // MINIMIZED: a compact pill to bring the bar back after Save draft / Publish, still docked bottom-center.
  if (!open) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface/95 px-3.5 py-2 text-xs font-semibold text-text shadow-pop backdrop-blur transition-colors hover:bg-surface-elevated"
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />{' '}
          {hasUnpublishedChanges ? 'Unpublished changes' : 'Editing tools'}
        </button>
      </div>
    )
  }

  return (
    <div
      // Docked to the viewport bottom, spanning the full width OVER the admin rail (z above the rail's z-50).
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-border bg-surface/95 shadow-pop backdrop-blur pb-[env(safe-area-inset-bottom)]"
      // Pad the interactive cluster clear of the admin rail (its live width, 0 when closed / on mobile).
      style={{ paddingRight: 'var(--admin-rail-w, 0px)' }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        {/* Autosave cue — reflects the store's saving flag; aria-live so an AT hears it settle. */}
        <span
          className="flex items-center gap-1.5 text-xs font-medium text-subtle"
          role="status"
          aria-live="polite"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Draft · Saving
            </>
          ) : hasUnpublishedChanges ? (
            // The one thing the owner could not tell before: saved is not the same as live.
            <span className="font-semibold text-primary-strong">
              Saved, not yet live. Publish to show these changes to everyone.
            </span>
          ) : (
            <>
              <Check className="h-3.5 w-3.5 text-success" aria-hidden /> Draft · Saved
            </>
          )}
        </span>

        {/* Undo — pops the shared store's history stack; disabled when there is nothing to undo. */}
        <button
          type="button"
          onClick={() => store.undo()}
          disabled={!canUndo}
          aria-label="Undo the last change"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Undo
        </button>

        {/* Visible on network — the preferences.profilePublished control, as an accessible switch. */}
        <button
          type="button"
          role="switch"
          aria-checked={published}
          disabled={visibleBusy}
          onClick={() => void onToggleVisible()}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
        >
          <span
            aria-hidden
            className={`relative h-4 w-7 shrink-0 rounded-pill transition-colors ${
              published ? 'bg-primary' : 'bg-border-strong'
            }`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-pill bg-on-primary transition-all ${
                published ? 'left-3.5' : 'left-0.5'
              }`}
            />
          </span>
          Visible on network
        </button>

        {error && (
          <span className="text-xs font-medium text-danger" role="alert">
            {error}
          </span>
        )}

        {/* Actions sit at the FAR RIGHT, off the edge (a right margin), each on ONE row at a legible size.
            The old two-line label + sublabel is gone; the intent rides along as a title tooltip. */}
        <div className="ml-auto mr-1 flex items-center gap-2 sm:mr-3">
          {/* DISCARD — the missing half of a draft system. Publish was the only thing that ever
              removed the draft node, so an owner who tried an arrangement and decided against it
              had no way out of the "unpublished changes" state, which arms a confirm on every rail
              dismissal. Only shown when there is actually something to throw away, and it can never
              touch the live page (the action deletes the draft key alone). */}
          {hasUnpublishedChanges && (
            <button
              type="button"
              onClick={() => void onDiscard()}
              disabled={discardBusy}
              title="Go back to the page visitors see"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-danger disabled:opacity-60"
            >
              {discardBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden />
              )}
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={onSaveDraft}
            title="Come back later"
            className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-bold text-text transition-colors hover:bg-surface-elevated"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={() => void onPublish()}
            disabled={publishBusy}
            title="Go live now"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-bold text-on-primary lift-1 transition-colors hover:bg-primary-strong disabled:opacity-60"
          >
            {publishBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Globe className="h-4 w-4" aria-hidden />
            )}
            Publish
          </button>
        </div>
      </div>
    </div>
  )
}
