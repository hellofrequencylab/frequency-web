'use client'

import { useRef } from 'react'
import { buttonClasses } from '@/components/ui/button'

// A submit button that asks for confirmation before submitting its form. Used to guard destructive
// server-action forms (e.g. Delete a listing) from a stray click. The parent stays a Server Component;
// only this button opts into the client so it can prompt. Voice-canon copy passed in by the caller.
export function ConfirmSubmitButton({
  confirm,
  label,
  variant = 'ghost',
  size = 'sm',
}: {
  confirm: string
  label: string
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
}) {
  // Re-entrancy guard (docs/INTERACTION-STATES.md §4 rule 4): this submits a form that usually
  // DELETES something, and a second click before the navigation lands would fire the action
  // twice. A ref, not state, and no `disabled` flip: flipping the button to disabled inside the
  // click handler cancels the browser's own submit in some engines, so the guard has to sit
  // beside the default action rather than in front of it.
  const submitting = useRef(false)
  return (
    <button
      type="submit"
      className={buttonClasses(variant, size)}
      onClick={(e) => {
        if (submitting.current) {
          e.preventDefault()
          return
        }
        if (!window.confirm(confirm)) {
          e.preventDefault()
          return
        }
        submitting.current = true
      }}
    >
      {label}
    </button>
  )
}
