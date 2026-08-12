'use client'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE SPARK MODAL (ADR-1010 · docs/STUDIO.md §1 · docs/PAGE-FRAMEWORK.md §9).
//
// WHAT IT IS. The modal HALF of a Spark. It is mounted ONLY from the `@wizard` parallel-route slot
// (app/(main)/@wizard/(.)…), so it wraps a wizard that a member reached by an in-app link. The very
// same route, reached cold — a shared link, a refresh, a bookmark, a crawler — never renders this
// file at all: it renders the wizard's own page, full screen. One route, two presentations, and
// exactly one wizard component behind both.
//
// WHY THIS AND NOT A CLIENT-STATE MODAL. ADR-986 made every create entry point a deep-linkable
// Spark link, and a `useState(false)` modal repeals that silently: the URL stops naming what is on
// screen, so the link cannot be shared, the back button does the wrong thing, and a refresh loses
// the surface. Intercepting routes give the owner's ask ("I don't want people leaving the page")
// without paying that price, because the URL still moves and still resolves standalone.
//
// THE ONE THING THIS FILE OWES ANYONE. A wizard holds unsaved work, and closing a modal is a far
// lighter gesture than navigating away, so the RISK OF LOSING WORK GOES UP with this feature. Three
// answers, in order of how much they matter:
//
//   1. THE WORK IS ALREADY SAVED. `SparkShell` autosaves every Spark (ADR-991 + 1001): the local
//      copy on an 800ms debounce, the account copy rate-limited beside it, and a FORCED flush on
//      unmount whenever the wizard is not mid-commit (use-spark-draft.ts, "the commit, recognised
//      without a wizard change"). Closing this modal unmounts the Spark, which IS that flush. The
//      draft is then in `studio_draft`, listed on /drafts, and offered back on the next visit.
//      Nothing here re-implements any of that; the modal simply must not defeat it, which is why it
//      NEVER unmounts the Spark by any path other than a real navigation.
//   2. THE CHEAPEST GESTURE IS REMOVED. Backdrop click does not dismiss (`dismissOnBackdrop=false`).
//      A mis-tap on the dim area beside a half-answered wizard is the single most likely way this
//      feature hurts someone, and it is the one dismissal that carries no intent at all.
//   3. THE REMAINING GESTURES ASK FIRST, ONCE THE MEMBER HAS TYPED. The close button and Escape run
//      through `requestClose`, which confirms while the wizard is dirty and closes straight away
//      while it is not. Dirtiness is observed the same entity-blind way the autosave observes it —
//      an `input`/`change` listener on the subtree — so no wizard declares anything.
//
// SCROLL. Next 16.3's `<Link>` "is to maintain scroll position … as long as the Page is visible in
// the viewport", and its scroll-target search "bypasses … sticky or fixed positioned elements"
// (node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md §`scroll`). The
// intercepted Page IS this fixed overlay, so the router skips it, finds the still-visible page
// underneath, and leaves the scroll where it was. That is why not one of the ~20 entry-point links
// needed a `scroll={false}`, and it is why `StudioWindow`'s fixed root is load-bearing rather than
// cosmetic. `wizard-modal.test.tsx` pins it.
//
// MOBILE. `StudioWindow` is edge-to-edge below `sm` and sits at `z-[80]`, which is above the shell's
// fixed bottom tab bar (`md:hidden … bottom-0 z-40`, app-shell.tsx). Covering the tab bar is the
// deliberate choice: a Spark is a single focused task, and a half-covered tab bar is worse than
// none. The body carries the bottom safe-area inset so the last control clears the home indicator.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { buttonClasses } from '@/components/ui/button'
import { StudioWindow } from './studio-window'

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

export function WizardModal({
  eyebrow,
  ariaLabel,
  children,
}: {
  /** The kicker on the window's chrome bar, e.g. "New circle". */
  eyebrow: string
  /** The dialog's accessible name. Defaults to the eyebrow. */
  ariaLabel?: string
  children: ReactNode
}) {
  const router = useRouter()
  const isClient = useIsClient()
  const [confirming, setConfirming] = useState(false)
  /** Has anything been typed into the wizard? A ref, because nothing renders from it until the
   *  member asks to close, and a keystroke must never cost a render. */
  const dirty = useRef(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const keepGoingRef = useRef<HTMLButtonElement>(null)

  // Dirtiness, observed rather than declared. Entity-blind on purpose: the modal never learns that
  // this is a Circle, only that a control inside it changed. Same technique as the Spark autosave
  // (components/studio/spark/draft/use-spark-draft.ts), for the same reason — it works with zero
  // wizard changes and cannot drift when a wizard adds a field.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const onEdit = () => {
      dirty.current = true
    }
    el.addEventListener('input', onEdit)
    el.addEventListener('change', onEdit)
    return () => {
      el.removeEventListener('input', onEdit)
      el.removeEventListener('change', onEdit)
    }
  }, [])

  // Interception happens ONLY on a client-side navigation, so there is always an entry behind this
  // one and `back()` is the correct close: it pops the wizard URL, restores the page's own scroll
  // through the browser's history restoration, and leaves forward-navigation working (a member who
  // closes by accident gets the wizard back with the forward button, draft intact).
  const leave = useCallback(() => {
    router.back()
  }, [router])

  const requestClose = useCallback(() => {
    // Escape while the confirm is up cancels the confirm rather than closing. A confirmation that
    // the second Escape blows through is not a confirmation.
    if (confirming) {
      setConfirming(false)
      return
    }
    if (dirty.current) {
      setConfirming(true)
      return
    }
    leave()
  }, [confirming, leave])

  // Move focus onto the safe choice when the confirm appears, so a keyboard member is not left on a
  // button that is now behind a decision.
  useEffect(() => {
    if (confirming) keepGoingRef.current?.focus()
  }, [confirming])

  // Portal only on the client; the server and the first hydration pass render nothing, matching.
  if (!isClient) return null

  return createPortal(
    <StudioWindow
      open
      onClose={requestClose}
      eyebrow={eyebrow}
      ariaLabel={ariaLabel ?? eyebrow}
      closeLabel="Close"
      // The one dismissal that carries no intent. See the header, point 2.
      dismissOnBackdrop={false}
      footer={
        confirming ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-body-sm text-muted" role="status">
              Close this? What you have written is saved in Drafts.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                ref={keepGoingRef}
                type="button"
                onClick={() => setConfirming(false)}
                className={buttonClasses('primary', 'sm')}
              >
                Keep going
              </button>
              <button type="button" onClick={leave} className={buttonClasses('secondary', 'sm')}>
                Close
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      {/* The bottom safe-area inset lives here rather than in each wizard: below `sm` the window is
          edge-to-edge, so the last control would otherwise sit on the home indicator. */}
      <div ref={bodyRef} data-wizard-modal-body className="pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </StudioWindow>,
    document.body,
  )
}
