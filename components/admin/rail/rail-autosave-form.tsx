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

// The debounced twin: a composite that changes on every keystroke as well as on clicks (the repeat
// picker's interval box beside its weekday pills) commits through this, so a burst of edits collapses
// into one save exactly as typing into a text field does.
const RailSaveSoonContext = createContext<() => void>(() => {})

/** Commit the enclosing RailAutosaveForm after the text debounce — for a composite that changes often. */
export function useRailSaveSoon(): () => void {
  return useContext(RailSaveSoonContext)
}

// The form's save state, for a control that offers its own explicit "Update changes" and should say
// what happened beside it rather than only in the cue at the foot of the form.
const RailSaveStateContext = createContext<{ state: RailSaveState; error: string | null }>({ state: 'idle', error: null })

/** The enclosing RailAutosaveForm's current save state. */
export function useRailSaveState(): { state: RailSaveState; error: string | null } {
  return useContext(RailSaveStateContext)
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
      <p role="alert" className="flex items-center gap-1.5 text-meta font-medium text-danger">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {error ?? 'Could not save. Try again.'}
      </p>
    )
  }
  if (state === 'idle') {
    return <p className="text-2xs text-muted">Changes save automatically.</p>
  }
  return (
    <p className="flex items-center gap-1.5 text-meta font-medium text-subtle" aria-live="polite">
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
  const saveSoon = useCallback(() => snapshot(false), [snapshot])

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
      <RailSaveNowContext.Provider value={saveNow}>
        <RailSaveSoonContext.Provider value={saveSoon}>
          <RailSaveStateContext.Provider value={{ state, error }}>{children}</RailSaveStateContext.Provider>
        </RailSaveSoonContext.Provider>
      </RailSaveNowContext.Provider>
      <div className="pt-1">
        <RailSaveRow state={state} error={error} />
      </div>
    </form>
  )
}
