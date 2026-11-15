'use client'

// Confirm a stop by entering the code printed there (FH-016S). The server action decides everything.
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { claimStopAction, type ClaimStopState } from '@/app/(main)/hunts/[slug]/play/actions'

const INITIAL: ClaimStopState = { status: 'idle', message: '' }

export function ClaimStopForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(claimStopAction, INITIAL)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <Field label="Code at the stop">
        <Input name="code" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? 'Checking' : 'Confirm stop'}</Button>
      {state.message && <p role="status" className="text-body-sm">{state.message}</p>}
    </form>
  )
}
