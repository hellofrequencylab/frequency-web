'use client'

import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react'
import { Check, AlertCircle } from 'lucide-react'
import {
  useRailAutosave,
  isInstant,
  isTextLike,
  type RailSaveState,
} from '@/components/admin/rail/use-rail-autosave'

// Programmatic commits (a map pin drag, a venue autocomplete that fills several fields at once) need to
// trigger a save even though React's setState fires no native form event. A descendant reads `saveNow`
// from this context and calls it; a no-op default keeps a stray consumer safe outside a form.
const RailSaveNowContext = createContext<() => void>(() => {})

/** Commit the enclosing RailAutosaveForm now — for a control that changes a field programmatically. */
export function useRailSaveNow(): () => void {
  return useContext(RailSaveNowContext)
}

// ── The shared autosave FORM for rail editors (docs/ADMIN-RAIL.md — save-model unification) ────────────
// A drop-in replacement for the per-module `<form onSubmit>` + Save button. It wires the whole form to
// `useRailAutosave`: text fields commit on BLUR (debounced), selects/toggles/radios commit INSTANTLY, and
// every successful save calls `router.refresh()` so the page behind the rail updates live. There is NO
// Save button — one small "Saving…/Saved" cue stands in (the "minimize buttons" directive).
//
// Complex modules (a draggable map pin, a venue autocomplete that fills several fields at once) get a
// `saveNow()` via the render-prop so a PROGRAMMATIC change still commits — a change React makes to a
// controlled input does not fire the form's native change/blur.

/** The tiny shared save cue — replaces every hand-rolled "Saved ✓" + Save button footer. */
export function RailSaveRow({ state, error }: { state: RailSaveState; error: string | null }) {
  if (state === 'error') {
    return (
      <p role="alert" className="flex items-center gap-1.5 text-xs font-medium text-danger">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {error ?? 'Could not save. Try again.'}
      </p>
    )
  }
  if (state === 'idle') {
    return <p className="text-2xs text-subtle">Changes save automatically.</p>
  }
  return (
    <p className="flex items-center gap-1.5 text-xs font-medium text-subtle" aria-live="polite">
      {state === 'saving' ? (
        'Saving…'
      ) : (
        <span className="flex items-center gap-1 text-success">
          <Check className="h-3.5 w-3.5" aria-hidden /> Saved
        </span>
      )}
    </p>
  )
}

export function RailAutosaveForm({
  action,
  children,
  className,
  errorFallback,
}: {
  /** The entity's existing full-form mutation, bound to its ids (e.g. `updateHubSettings.bind(null, id, slug)`). */
  action: (fd: FormData) => Promise<unknown>
  /** The fields. A descendant that changes a field programmatically calls `useRailSaveNow()` to commit. */
  children: ReactNode
  className?: string
  errorFallback?: string
}) {
  const { state, error, commit } = useRailAutosave(action, { errorFallback })
  const formRef = useRef<HTMLFormElement>(null)

  const snapshot = useCallback(
    (immediate: boolean) => {
      const form = formRef.current
      if (form) commit(new FormData(form), immediate)
    },
    [commit],
  )
  const saveNow = useCallback(() => snapshot(true), [snapshot])

  return (
    <form
      ref={formRef}
      onSubmit={(e) => e.preventDefault()}
      onBlur={(e) => {
        if (isTextLike(e.target)) snapshot(false)
      }}
      onChange={(e) => {
        if (isInstant(e.target)) snapshot(true)
      }}
      className={className ?? 'space-y-4'}
    >
      <RailSaveNowContext.Provider value={saveNow}>{children}</RailSaveNowContext.Provider>
      <div className="pt-1">
        <RailSaveRow state={state} error={error} />
      </div>
    </form>
  )
}
