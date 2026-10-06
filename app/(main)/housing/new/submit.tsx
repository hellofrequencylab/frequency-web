'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

// The pending state for the housing compose and edit form (SCAN-762).
//
// The create path is slow before it redirects: the action geocodes the address, then runs a
// governed write that mints a fresh proposal per submission, and nothing on the create side is
// idempotent. React 19 does not block a second submit while a form action is pending, so a
// member who tapped "List housing", saw nothing happen, and tapped again posted the same listing
// twice. Same shape as the sign-in door (app/sign-in/submit.tsx).
//
// `useFormStatus` only reports on a form it is INSIDE, so this is its own leaf rendered inside
// the <form>. `Button`'s `loading` prop marks the control `aria-busy`, disables it (the
// re-entrancy guard, docs/INTERACTION-STATES.md §4 rule 4) and leaves the label alone (§4 rule 3).
export function HousingSubmit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" size="md" loading={pending}>
      {children}
    </Button>
  )
}
