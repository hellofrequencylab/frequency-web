'use client'

import type { MenuMode } from '@/lib/menus/types'

// A simple ON/OFF switch that maps to an element's base `mode` (point 6):
//   ON  = mode 'active' (globally shown, unless a per-role override says otherwise)
//   OFF = mode 'hidden' (globally hidden, unless a per-role override says otherwise)
// Ghost is never set from here — it is a per-role presentation chosen in the matrix. A
// link whose stored mode is 'ghost' reads as ON for the global switch (it is visible by
// default), so toggling OFF cleanly flips the base to hidden.
//
// Used by item rows and rail cards. When `locked` (the fixed Profile pin), the switch is
// disabled and pinned to ON, with an explanatory caption.
export function OnOffToggle({
  mode,
  onChange,
  disabled,
  locked,
  label = 'Visible',
}: {
  mode: MenuMode
  onChange: (next: MenuMode) => void
  disabled?: boolean
  locked?: boolean
  label?: string
}) {
  const on = locked ? true : mode !== 'hidden'
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled || locked}
        onClick={() => onChange(on ? 'hidden' : 'active')}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          on ? 'bg-primary' : 'bg-surface-elevated'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-canvas shadow transition-transform ${
            on ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <span className="text-xs font-medium text-subtle">{on ? 'On' : 'Off'}</span>
    </span>
  )
}
