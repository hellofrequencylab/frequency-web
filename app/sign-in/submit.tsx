'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

// The pending state for the two sign-in forms (LIVE-043).
//
// WHAT IT COSTS TO NOT HAVE ONE, and why this is a correctness fix rather than a polish one:
// pressing "Send magic link" made the page sit still for as long as the mail provider took.
// The instinct is to press again, and the second press is not harmless — Supabase issues a NEW
// one-time token and INVALIDATES the first. The person then opens the first link (the one their
// mail client showed first, or the one that arrived while they were still looking) and it is
// already dead. A member who taps twice out of impatience has locked themselves out of the only
// door, and nothing on screen explains why.
//
// `useFormStatus` only reports on a form it is INSIDE, which is why the button is its own
// component rather than a prop on the page: the page stays a Server Component and only this
// leaf ships to the browser.
//
// The look follows docs/INTERACTION-STATES.md rather than being invented here. `Button`'s
// `loading` prop marks the control `aria-busy`, disables it (the re-entrancy guard, §4 rule 4),
// and LEAVES THE LABEL ALONE — no spinner, no "Sending…", because a pending state must never
// change the control's width (§4 rule 3). The disabled fade is the cue.
export function SignInSubmit({
  variant = 'primary',
  className,
  children,
}: {
  variant?: 'primary' | 'secondary'
  className?: string
  children: React.ReactNode
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} size="md" loading={pending} className={className}>
      {children}
    </Button>
  )
}
