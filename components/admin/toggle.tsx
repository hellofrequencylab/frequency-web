'use client'

import { Check } from 'lucide-react'

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
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-primary' : 'bg-border-strong'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
          }`}
        />
      </button>
      {saveState !== 'idle' && (
        <span className="text-xs text-subtle" aria-live="polite">
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
