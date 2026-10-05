'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

// The pending state for the housing compose and edit forms (SCAN-762), the sign-in pattern
// (app/sign-in/submit.tsx). The create path geocodes and then runs the governed write before it
// redirects, and React does not block a second submit while a form action is pending: a second tap
// on "List housing" posted the same listing twice. `Button`'s `loading` prop disables the control
// and marks it aria-busy without changing its label or width (docs/INTERACTION-STATES.md).
// useFormStatus only reports on a form it is INSIDE, which is why this is its own leaf.
export function HousingSubmit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" size="md" loading={pending}>
      {children}
    </Button>
  )
}
