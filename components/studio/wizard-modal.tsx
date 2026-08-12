'use client'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE SPARK MODAL (ADR-1010 · docs/STUDIO.md §1 · docs/PAGE-FRAMEWORK.md §9).
//
// WHAT IT IS. The modal HALF of a Spark. Mounted ONLY from the `@wizard` parallel-route slot
// (app/(main)/@wizard/(.)…), so it wraps a wizard a member reached by an in-app link. The very same
// route reached cold — a shared link, a refresh, a bookmark, a crawler — never renders this file at
// all: it renders the wizard's own page, full screen. One route, two presentations, one wizard.
//
// WHY NOT A CLIENT-STATE MODAL. ADR-986 made every create entry point a deep-linkable Spark link,
// and a `useState(false)` modal repeals that silently: the URL stops naming what is on screen, the
// link cannot be shared, Back does the wrong thing, and a refresh loses the surface. Intercepting
// routes give the owner's ask ("I don't want people leaving the page") without paying that price.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE SAFEGUARDS. A wizard holds unsaved work and a modal is cheap to close, so the risk of losing
// work goes UP with this feature. Three layers, and only the third is new here:
//
//   LAYER 1 — THE BROWSER CACHE. `SparkShell` already keeps every answer in `localStorage`
//     (components/studio/spark/draft/draft-store.ts, ADR-991): versioned key, seven-day TTL, 20k
//     per value and 100k per draft, and file inputs / passwords / `data-spark-draft="off"` refused
//     at collection. localStorage rather than IndexedDB is the right call for this shape — the
//     staged state is a flat `{fieldKey: string}` map of what was TYPED, never a File or a Blob,
//     because a half-uploaded image is refused at collection rather than staged.
//   LAYER 2 — THE DATABASE. The same answers are staged in `studio_draft`, keyed
//     `(profile_id, scope)` with the profile id resolved from the SESSION, carrying `route` and
//     `label` so /drafts can offer a way back in. Writes are debounced (800ms local) and the server
//     push is rate limited beside it (~2s), with a forced flush on unmount, `pagehide`, and
//     `visibilitychange`. Nothing here re-implements any of it; the modal's job is to not defeat
//     it, which is why it never unmounts a Spark except through a real navigation.
//   LAYER 3 — THE CLOSE WARNING (this file). Every exit is routed through `requestClose`.
//
// EVERY EXIT, AND WHICH MECHANISM COVERS IT:
//
//   | Exit                     | Covered by                       | Guarded? |
//   |--------------------------|----------------------------------|----------|
//   | Close button (X)         | StudioWindow `onClose`           | ✅ dialog |
//   | Escape                   | StudioWindow keydown → `onClose`  | ✅ dialog |
//   | Backdrop click           | `dismissOnBackdrop={false}`      | ✅ inert  |
//   | Browser Back             | the history sentinel below        | ✅ dialog |
//   | Refresh / tab close      | `beforeunload`, while a write is owed | ⚠️ generic browser prompt |
//   | A link INSIDE the wizard | nothing                           | 🔴 not guarded, and it does not need to be |
//
//   BROWSER BACK is the one that matters and the one a naive guard misses, because with
//   intercepting routes Back is a ROUTE CHANGE, not an unmount this component controls. The fix is
//   a history sentinel: the first time the member types, we push a same-URL history entry. Back
//   then pops that entry instead of the wizard, `popstate` fires with the modal still mounted, we
//   re-push the sentinel and ask. Closing for real calls `history.go(-2)` to step over both the
//   sentinel and the wizard entry in one go. While the wizard is CLEAN no sentinel is ever pushed,
//   so Back closes instantly, as it should.
//
//   REFRESH / TAB CLOSE is netted by `beforeunload`, armed ONLY while `pending` is true — a
//   debounce is waiting or a save is in flight. That is the only window in which leaving would
//   really lose a keystroke; outside it both copies are already written, so a prompt would be
//   firing when there is nothing to lose, which is how a dialog trains people to dismiss it
//   unread. The prompt is the browser's own generic text (no modern browser allows custom copy,
//   and the handler cannot be async), so this is a net under the real dialog, never the mechanism.
//
//   A LINK INSIDE THE WIZARD is deliberately NOT guarded, and this is a documented gap rather than
//   an oversight: intercepting it would mean wrapping every anchor a wizard might render. It costs
//   the member nothing, because the unmount flush persists the draft on the way out and /drafts
//   offers it straight back. What they lose is the modal, not the writing.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE INTERACTION, AND THE BEST PRACTICE APPLIED (owner: "do whatever is best practice"):
//
//   • CENTRED DIALOG ON DESKTOP, FULL-HEIGHT SHEET ON MOBILE. `StudioWindow` already is exactly
//     this (`items-stretch` + `h-full w-full` below `sm`, `sm:items-center sm:max-w-3xl
//     sm:max-h-[86vh] sm:rounded-card` above it), which is why it is composed rather than replaced.
//   • BACKDROP IS INERT. The mature choice for a wizard holding unsaved work: a click-outside is
//     the cheapest possible gesture attached to the most expensive possible outcome, and routing it
//     through the three-way dialog instead would train members to expect a dialog from a mis-tap.
//     Escape and the X still work, and both ask.
//   • FOCUS LANDS ON THE FIRST MEANINGFUL FIELD, not the close button. The shared trap
//     (`useDialogFocusTrap`, via StudioWindow) seeds focus at the first focusable in the panel,
//     which is the X; this component's effect runs after it and moves focus into the body.
//   • MOTION honours `prefers-reduced-motion` (StudioWindow's `motion-safe:` enter, SparkShell's
//     `motion-reduce:animate-none` step transition). Nothing new is introduced.
//   • STEPS, PROGRESS, VALIDATION AND THE STICKY FOOTER stay with `SparkShell`, which already owns
//     `WizardProgress`, the per-step error slot, and the Back/Continue row. A modal that re-decided
//     any of them would be the per-entity fork STUDIO.md §0 forbids.
//   • SCROLL IS CONTAINED to the window body; the page behind is locked by StudioWindow.
//   • MOBILE TAB BAR. StudioWindow sits at `z-[80]`, above the shell's fixed bottom tab bar
//     (`md:hidden … bottom-0 z-40`). Covering it is deliberate: a Spark is one focused task and a
//     half-covered tab bar is worse than none. The body carries the bottom safe-area inset.
//
// SCROLL POSITION. Next 16.3's `<Link>` default "is to maintain scroll position … as long as the
// Page is visible in the viewport", and its scroll-target search "bypasses … sticky or fixed
// positioned elements" (node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md
// §`scroll`). The intercepted Page IS this fixed overlay, so the router skips it, finds the still-
// visible page underneath, and leaves the scroll alone. That is why not one of the ~20 entry-point
// links needed `scroll={false}`, and why StudioWindow's fixed root is load-bearing.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { buttonClasses } from '@/components/ui/button'
import { StudioWindow } from './studio-window'
import { WizardGuardContext, type WizardDraftReport } from './wizard-guard'

/** Marks a history entry this component pushed, so `popstate` can tell it apart from a real one. */
const SENTINEL = '__frequencyWizardGuard'

// True on the client, false during SSR + the first hydration pass, without a setState-in-effect
// (which this repo's lint forbids). Same shape as components/ui/dialog.tsx, which portals for the
// same reason: a `position: fixed` overlay anchors to the nearest transformed ancestor rather than
// the viewport, and the app shell has several.
const emptySubscribe = () => () => {}
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}

/** What the close dialog is currently asking. `null` is the ordinary state: no dialog at all. */
type Ask = null | 'leave' | 'discard'

export function WizardModal({
  eyebrow,
  ariaLabel,
  children,
}: {
  /** The kicker on the window's chrome bar, e.g. "Studio · Circle". */
  eyebrow: string
  /** The dialog's accessible name. Defaults to the eyebrow. */
  ariaLabel?: string
  children: ReactNode
}) {
  const router = useRouter()
  const isClient = useIsClient()
  const [ask, setAsk] = useState<Ask>(null)
  /** Has anything been typed? A ref, not state: nothing renders from it until the member tries to
   *  leave, and a keystroke must never cost a render. */
  const dirty = useRef(false)
  /** The live report from the Spark inside: its draft scope, how to erase it, whether a write is
   *  owed. A ref, because it is written during the child's render-commit and read only in handlers. */
  const draft = useRef<WizardDraftReport | null>(null)
  const [pending, setPending] = useState(false)
  /** True once the history sentinel is on the stack. */
  const trapped = useRef(false)
  /** Set immediately before a real departure, so our own `history.go` is not mistaken for a Back. */
  const leaving = useRef(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const safeChoiceRef = useRef<HTMLButtonElement>(null)

  const report = useCallback((next: WizardDraftReport) => {
    draft.current = next
    // Only this one field drives a render (the beforeunload arm); the rest are read on demand.
    setPending((was) => (was === next.pending ? was : next.pending))
  }, [])

  /** Push the sentinel that turns the next Back press into a `popstate` we can answer. Same URL, so
   *  nothing on screen changes and the wizard's own address is still what the member sees. */
  const arm = useCallback(() => {
    if (trapped.current || typeof window === 'undefined') return
    trapped.current = true
    window.history.pushState({ [SENTINEL]: true }, '')
  }, [])

  // Dirtiness, observed rather than declared. Entity-blind on purpose: the modal never learns that
  // this is a Circle, only that a control inside it changed. Same technique as the Spark autosave
  // (components/studio/spark/draft/use-spark-draft.ts), for the same reason — it works with zero
  // wizard changes and cannot drift when a wizard adds a field.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const onEdit = () => {
      if (dirty.current) return
      dirty.current = true
      arm()
    }
    el.addEventListener('input', onEdit)
    el.addEventListener('change', onEdit)
    return () => {
      el.removeEventListener('input', onEdit)
      el.removeEventListener('change', onEdit)
    }
  }, [arm])

  // Focus the first MEANINGFUL control rather than the close button. StudioWindow's shared trap
  // seeds focus at the panel's first focusable, which is the chrome bar's X; this effect runs after
  // it (a parent's effects run after its children's) and moves focus into the body.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const first = el.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )
    first?.focus()
  }, [])

  /**
   * Leave for real. Interception only ever happens on a client-side navigation, so there is always
   * an entry behind this one. When the sentinel is armed we must step over BOTH it and the wizard
   * entry, which is one `go(-2)` rather than two `back()` calls (two would race the router).
   */
  const leave = useCallback(() => {
    leaving.current = true
    if (trapped.current) {
      trapped.current = false
      window.history.go(-2)
      return
    }
    router.back()
  }, [router])

  /** Keep as draft: the answers are already in both layers, so this is simply a clean exit. */
  const keepAsDraft = useCallback(() => {
    leave()
  }, [leave])

  /** Discard: erase the browser cache AND the `studio_draft` row, then go. Destructive, two taps. */
  const discardAndLeave = useCallback(() => {
    draft.current?.discard()
    leave()
  }, [leave])

  const requestClose = useCallback(() => {
    // Escape while a dialog is up backs out of the dialog rather than blowing through it. A
    // confirmation the second Escape defeats is not a confirmation.
    if (ask === 'discard') {
      setAsk('leave')
      return
    }
    if (ask === 'leave') {
      setAsk(null)
      return
    }
    // Nothing typed: close instantly, with no dialog at all. A warning that always fires is one
    // people learn to dismiss unread, which costs you the time it mattered.
    if (!dirty.current) {
      leave()
      return
    }
    setAsk('leave')
  }, [ask, leave])

  // BROWSER BACK. The sentinel is only on the stack while the member has typed, so a clean wizard's
  // Back is never intercepted. When it IS armed, we put the sentinel straight back (so a second
  // Back is caught too) and ask instead of leaving.
  useEffect(() => {
    const onPop = () => {
      if (leaving.current || !trapped.current) return
      window.history.pushState({ [SENTINEL]: true }, '')
      setAsk('leave')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // REFRESH / TAB CLOSE. Armed only while a write is genuinely owed. Outside that window both
  // copies are already on disk and there is nothing to warn about. The browser shows its own
  // generic text; no modern browser allows custom copy and the handler cannot be async, so this is
  // the net under the dialog rather than the dialog itself.
  useEffect(() => {
    if (!pending) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pending])

  // Move focus onto the safe choice whenever a dialog opens, so a keyboard member is not left on a
  // control that is now behind a decision.
  useEffect(() => {
    if (ask) safeChoiceRef.current?.focus()
  }, [ask])

  // Portal only on the client; the server and the first hydration pass render nothing, matching.
  if (!isClient) return null

  const canDiscard = Boolean(draft.current?.scope)

  return createPortal(
    <WizardGuardContext.Provider value={report}>
      <StudioWindow
        open
        onClose={requestClose}
        eyebrow={eyebrow}
        ariaLabel={ariaLabel ?? eyebrow}
        closeLabel="Close"
        // The one dismissal that carries no intent. See the header.
        dismissOnBackdrop={false}
        footer={
          ask === null ? undefined : ask === 'leave' ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-body-sm text-muted" role="status">
                {/* Says what happens to their work. Does not narrate how they feel about it. */}
                Leave this for now? What you have written is saved in Drafts, on this device and on
                your account.
              </p>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  ref={safeChoiceRef}
                  type="button"
                  onClick={keepAsDraft}
                  className={buttonClasses('primary', 'sm')}
                >
                  Keep as draft
                </button>
                <button
                  type="button"
                  onClick={() => setAsk(null)}
                  className={buttonClasses('secondary', 'sm')}
                >
                  Back to it
                </button>
                {/* Destructive, so it is never the default and never the first target. Reaching the
                    erase itself takes a second, separate tap. */}
                {canDiscard && (
                  <button
                    type="button"
                    onClick={() => setAsk('discard')}
                    className={buttonClasses('dangerOutline', 'sm')}
                  >
                    Discard
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-body-sm text-muted" role="status">
                Discard what you have written? It goes from this device and from your account. There
                is no undo.
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  ref={safeChoiceRef}
                  type="button"
                  onClick={() => setAsk('leave')}
                  className={buttonClasses('primary', 'sm')}
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={discardAndLeave}
                  className={buttonClasses('danger', 'sm')}
                >
                  Discard it
                </button>
              </div>
            </div>
          )
        }
      >
        {/* The bottom safe-area inset lives here rather than in each wizard: below `sm` the window
            is edge-to-edge, so the last control would otherwise sit on the home indicator. */}
        <div ref={bodyRef} data-wizard-modal-body className="pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </StudioWindow>
    </WizardGuardContext.Provider>,
    document.body,
  )
}
