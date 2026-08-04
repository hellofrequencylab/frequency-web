'use client'

import { cn } from '@/lib/utils'

// A small accessible toggle switch (role="switch"). A native <button> gives keyboard operation (Space /
// Enter toggle) and focus for free; `aria-checked` reports the state to assistive tech. Controlled: the
// caller owns `checked` and flips it in `onCheckedChange`. Semantic tokens only, no hex.
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  pending = false,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  /** The flip already happened locally and the server has not confirmed it yet — the
   *  optimistic-pending state (docs/INTERACTION-STATES.md §4). Renders `.dimmed` (legible,
   *  no layout shift, never a spinner) and blocks the double-fire while the write is in
   *  flight. Distinct from `disabled`, which means "not available at all". */
  pending?: boolean
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}) {
  // Both stop the click; only `disabled` means "you cannot have this".
  const inert = disabled || pending
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-busy={pending || undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      disabled={inert}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        // State set per docs/INTERACTION-STATES.md §2 (Action control): rest · hover · pressed
        // (`.press`) · focus-visible · optimistic-pending · disabled.
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent press transition-[background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-default motion-reduce:transition-none',
        checked ? 'bg-primary' : 'bg-border-strong',
        // Hover is gated in TS rather than by a `disabled:` variant because :hover still
        // matches a disabled <button> — an inert switch must not light up under the pointer.
        !inert && (checked ? 'hover:bg-primary-hover' : 'hover:bg-subtle/50'),
        // `.dimmed` for pending (recedes but stays readable); the flat 50% for genuinely
        // unavailable. Never both — pending is not a refusal.
        pending ? 'dimmed' : disabled ? 'opacity-50' : null,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-surface shadow-sm transition-transform motion-reduce:transition-none',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
