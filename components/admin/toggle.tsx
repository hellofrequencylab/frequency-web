'use client'

import { Check } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

// Settings switch with a built-in save affordance (ADR-233 §5: imperative/toggle
// controls autosave with inline "Saved"). One accessible `role="switch"` so the AI /
// payments / demo settings stop hand-rolling the markup. The caller owns the value and
// the optimistic write; pass `saveState` to show the Saving…/Saved cue.
//
//   <Toggle checked={aiOn} ariaLabel="AI platform-wide" saveState={state}
//     onChange={(v) => save(v)} />

export function Toggle({
  checked,
  onChange,
  ariaLabel,
  saveState = 'idle',
  disabled = false,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  ariaLabel: string
  saveState?: 'idle' | 'saving' | 'saved'
  disabled?: boolean
}) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <Switch checked={checked} onCheckedChange={onChange} aria-label={ariaLabel} disabled={disabled} />
      {saveState !== 'idle' && (
        <span className="text-meta text-subtle" aria-live="polite">
          {saveState === 'saving' ? (
            'Saving…'
          ) : (
            <span className="inline-flex items-center gap-1 text-success">
              <Check className="h-3.5 w-3.5" aria-hidden />
              Saved
            </span>
          )}
        </span>
      )}
    </div>
  )
}
