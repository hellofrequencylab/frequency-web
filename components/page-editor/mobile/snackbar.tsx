'use client'

// A single, transient snackbar for the mobile editor — the Undo affordance after a
// delete, and the quiet "Saved" / "Draft saved" status. Deliberately NOT a global
// stack: the spec asks for one snackbar with an Undo action, auto-dismissing. The
// parent owns the message; this renders it pinned above the thumb zone.

import { useEffect } from 'react'

export type SnackbarState =
  | { kind: 'undo'; message: string; onUndo: () => void; key: number }
  | { kind: 'status'; message: string; key: number }
  | null

export function Snackbar({ state, onDismiss }: { state: SnackbarState; onDismiss: () => void }) {
  const key = state?.key
  useEffect(() => {
    if (!state) return
    const ms = state.kind === 'undo' ? 6000 : 1800
    const t = window.setTimeout(onDismiss, ms)
    return () => window.clearTimeout(t)
    // Re-arm whenever a new snackbar is shown (key changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!state) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[65] flex justify-center px-4"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-slat px-4 py-3 text-sm text-on-ink shadow-xl motion-safe:animate-[slideUp_0.25s_ease-out]">
        <span>{state.message}</span>
        {state.kind === 'undo' && (
          <button
            type="button"
            onClick={() => {
              state.onUndo()
              onDismiss()
            }}
            className="min-h-[36px] rounded-lg px-2 font-semibold text-primary underline-offset-2 hover:underline"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  )
}
