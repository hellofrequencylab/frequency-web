'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

// Destructive-action gate (ADR-233 §5 destructive tiering, Atlassian danger modal +
// NN/g). For risky-but-recoverable actions. Rules baked in: the action is NAMED on the
// confirm button (never "OK"); the SAFE/cancel button takes default focus; the
// destructive button is never the Enter default. For irreversible/bulk-destructive
// actions pass `requireTyping` (e.g. the resource name) — confirm stays disabled until
// it's typed exactly. For merely reversible actions use <UndoToast> instead, not this.
//
//   <DangerModal open={open} onClose={()=>setOpen(false)} title="Delete circle"
//     body="This removes the circle and its memberships. This cannot be undone."
//     confirmLabel="Delete circle" requireTyping="MoFlow Encinitas"
//     onConfirm={remove} />

export function DangerModal({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  onConfirm,
  requireTyping,
}: {
  open: boolean
  onClose: () => void
  title: string
  body: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  /** When set, confirm is disabled until the operator types this string exactly. */
  requireTyping?: string
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTyped('') // clear the type-to-confirm field each time the modal opens
    const t = setTimeout(() => cancelRef.current?.focus(), 50) // safe button gets focus
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null
  const blocked = requireTyping !== undefined && typed !== requireTyping

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="danger-title">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-lg">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="danger-title" className="text-base font-bold text-text">{title}</h2>
            <div className="mt-1 text-sm leading-relaxed text-muted">{body}</div>
          </div>
        </div>

        {requireTyping !== undefined && (
          <label className="mt-4 block">
            <span className="text-xs font-medium text-muted">
              Type <span className="font-bold text-text">{requireTyping}</span> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/30"
            />
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className="rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
