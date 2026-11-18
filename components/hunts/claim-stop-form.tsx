'use client'

// Confirm a stop by entering the code printed there (FH-016S). The server action decides everything.
// A Mystery stop (FH-042S) also takes an answer: the field shows when the page knows the open stop
// asks a question, or when the server says this one does. The code is kept between tries.
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { claimStopAction, type ClaimStopState } from '@/app/(main)/hunts/[slug]/play/actions'

const INITIAL: ClaimStopState = { status: 'idle', message: '' }

export function ClaimStopForm({ slug, askAnswer = false }: { slug: string; askAnswer?: boolean }) {
  const [state, action, pending] = useActionState(claimStopAction, INITIAL)
  const [code, setCode] = useState('')
  const showAnswer = askAnswer || state.askAnswer === true
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <Field label="Code at the stop">
        <Input name="code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} required />
      </Field>
      {showAnswer && (
        <Field label="Your answer">
          <Input name="answer" maxLength={120} autoComplete="off" spellCheck={false} />
        </Field>
      )}
      <Button type="submit" disabled={pending}>{pending ? 'Checking' : 'Confirm stop'}</Button>
      {state.message && <p role="status" className="text-body-sm">{state.message}</p>}
    </form>
  )
}
