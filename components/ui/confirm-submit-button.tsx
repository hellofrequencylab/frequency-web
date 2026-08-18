'use client'

import { useRef, useState } from 'react'
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
  // The VISIBLE half of the same guard (INTERACTION-STATES §1 "loading" + §4 rule 2). The ref
  // above blocks the second fire and paints nothing, so a member who confirmed a delete and then
  // watched the page sit still for a second had no evidence the first click landed — the exact
  // "did my tap register" gap the `loading` prop closed on Button.
  //
  // `.dimmed` is the sanctioned pending look: legible, desaturated, no layout shift, no spinner,
  // and the label is untouched so the control cannot change width mid-flight (§4 rule 3).
  // `aria-busy` carries the same fact to a screen reader.
  //
  // 🔴 NOT `disabled`, and this is the one thing about this component that must not be
  // "simplified" later. Disabling the SUBMITTER from inside its own click handler cancels the
  // browser's form submission in some engines — the button that was going to submit the form
  // stops being a valid submitter before the default action runs. That is why the re-entrancy
  // guard is a ref rather than state in the first place, and it is why the busy state here is
  // purely a look plus an ARIA fact. The double-fire is already handled, above.
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="submit"
      aria-busy={busy || undefined}
      className={buttonClasses(variant, size, busy ? 'dimmed' : undefined)}
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
        setBusy(true)
      }}
    >
      {label}
    </button>
  )
}
