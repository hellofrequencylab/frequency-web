'use client'

import { useCallback, useRef, useState } from 'react'
import { Undo2 } from 'lucide-react'

// Undo-first feedback (ADR-233 §5: prefer undo over confirm for REVERSIBLE actions).
// Do the action immediately (optimistic), then show a transient toast with an Undo
// affordance for ~6s — keeps operators in flow without a confirm dialog. Self-contained:
// the hook owns the toast state and renders the toast node; drop {toast} into your tree.
//
//   const { show, toast } = useUndoToast()
//   async function archive(id) {
//     await archiveCircle(id)                 // optimistic
//     show('Circle archived', () => restoreCircle(id))
//   }
//   return <>{rows}{toast}</>

const DURATION = 6000

export function useUndoToast() {
  const [state, setState] = useState<{ message: string; onUndo: () => void } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const show = useCallback(
    (message: string, onUndo: () => void) => {
      clear()
      setState({ message, onUndo })
      timer.current = setTimeout(() => setState(null), DURATION)
    },
    [clear],
  )

  const dismiss = useCallback(() => {
    clear()
    setState(null)
  }, [clear])

  const toast = state ? (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-text px-4 py-2.5 text-sm font-medium text-canvas shadow-lg motion-safe:animate-in motion-safe:slide-in-from-bottom-2"
    >
      <span className="truncate">{state.message}</span>
      <button
        type="button"
        onClick={() => {
          state.onUndo()
          dismiss()
        }}
        className="inline-flex items-center gap-1.5 rounded-full bg-canvas/15 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-canvas/25"
      >
        <Undo2 className="h-3.5 w-3.5" aria-hidden />
        Undo
      </button>
    </div>
  ) : null

  return { show, dismiss, toast }
}
