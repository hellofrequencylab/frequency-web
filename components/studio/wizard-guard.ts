'use client'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE WIZARD GUARD SEAM (ADR-1010).
//
// The ONE piece of information the Spark modal cannot work out for itself: which draft is on
// screen, and how to throw it away. A Spark's autosave scope is derived inside `SparkShell` from
// the pathname and the wizard's own eyebrow (`draftScope`), and the two erase paths live in
// `useSparkDraft`. Rather than have the modal guess at any of that — or, worse, learn per-entity
// which wizard it is wrapping — the shell REPORTS itself upward through this context.
//
// Two consequences worth stating, because they are the reason it is shaped this way:
//   • THE MODAL STAYS ENTITY-BLIND. It receives a scope string it never interprets and two
//     callbacks it never inspects, exactly as the autosave receives values it never interprets.
//     Adding a wizard adds nothing here.
//   • THE FULL-PAGE PRESENTATION IS UNCHANGED. With no provider above it (a cold hit on
//     /circles/new renders the page, not the modal), `useReportWizardDraft` is a no-op. One
//     wizard component, two presentations, and the guard only exists in the one that needs it.
//
// A surface that is NOT a Spark (the /market/sell upgrade wall, say) simply never registers, and
// the modal correctly offers no Discard for a draft that does not exist.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect } from 'react'

export interface WizardDraftReport {
  /** The Spark's autosave scope. Null when autosave is off for this surface. */
  scope: string | null
  /** Erase BOTH copies: the browser cache and the `studio_draft` row. Destructive, no undo. */
  discard: () => void
  /**
   * True while a write is still owed — a debounce is waiting or a save is in flight. This is the
   * ONLY window in which a refresh or a tab close could actually lose a keystroke, which is why it
   * is also the only window the `beforeunload` net is armed in.
   */
  pending: boolean
}

/** Set by `WizardModal`; absent everywhere else, which is what makes registration a no-op on the
 *  full-page presentation. */
export const WizardGuardContext = createContext<((report: WizardDraftReport) => void) | null>(null)

/**
 * Called by `SparkShell` on every render of a Spark. Reports the live draft handle up to the modal
 * when there is one, and does nothing at all when there is not.
 *
 * The effect has no dependency array on purpose: `pending` flips as the member types, and the
 * modal needs the current value at the moment they try to leave, not the value from mount.
 */
export function useReportWizardDraft(report: WizardDraftReport): void {
  const publish = useContext(WizardGuardContext)
  useEffect(() => {
    publish?.(report)
  })
}
