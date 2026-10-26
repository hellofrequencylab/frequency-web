'use client'

import { cn } from '@/lib/utils'

// A small accessible toggle switch (role="switch"), the members kit's `.sw` (ADR-1737: 46x28, the knob
// is its ::after, `.on` the iridescent fill; pending dims through `mu-pending`). A native <button> gives keyboard operation (Space /
// Enter toggle) and focus for free; `aria-checked` reports the state to assistive tech. Controlled: the
// caller owns `checked` and flips it in `onCheckedChange`. 
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
      className={cn('sw', checked && 'on', pending && 'mu-pending')}
    />
  )
}
