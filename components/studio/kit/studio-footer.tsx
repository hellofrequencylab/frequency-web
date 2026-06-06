import type { ReactNode } from 'react'
import { Loader2, Check } from 'lucide-react'
import type { SaveState } from './use-studio-draft'

// Footer kit: the save-state line + the action bar layout shared by every Studio
// builder's sticky footer. docs/STUDIO.md §2.

/** The autosave indicator (idle → saving → saved) + inline error. */
export function SaveStatus({
  state,
  error,
  idleLabel = 'Autosaves as you go',
}: {
  state: SaveState
  error?: string | null
  idleLabel?: string
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-subtle">
      {state === 'saving' ? (
        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
      ) : state === 'saved' ? (
        <><Check className="h-3.5 w-3.5 text-success" /> Saved</>
      ) : (
        <>{idleLabel}</>
      )}
      {error && <span className="ml-2 text-danger">{error}</span>}
    </span>
  )
}

/** Footer row: status/hint on the left, actions on the right. */
export function StudioFooter({ left, children }: { left?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      {left ?? <span />}
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}
