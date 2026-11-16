'use client'

// Confirm a stop by entering the code printed there (FH-016S). The server action decides everything.
// FH-042S: a Mystery stop also takes an answer. The answer box shows when the Trail's next stop is a
// Mystery (`mystery`), or as soon as the server asks for one, and the code stays filled in between
// tries. From a scan (`code`), the code is already known and only the answer is asked. The answer is
// checked on the server only; this form never sees the right one.
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { claimStopAction, type ClaimStopState } from '@/app/(main)/hunts/[slug]/play/actions'

const INITIAL: ClaimStopState = { status: 'idle', message: '' }

export function ClaimStopForm({ slug, code: scanned, mystery = false }: { slug: string; code?: string; mystery?: boolean }) {
  const [state, action, pending] = useActionState(claimStopAction, INITIAL)
  const [code, setCode] = useState(scanned ?? '')
  const [answer, setAnswer] = useState('')
  const asking = mystery || state.status === 'answer' || state.status === 'locked'
  const locked = state.status === 'locked'
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      {scanned ? (
        <input type="hidden" name="code" value={code} />
      ) : (
        <Field label="Code at the stop">
          <Input name="code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} required />
        </Field>
      )}
      {asking && !locked && (
        <Field label="Your answer" hint="Only for a Mystery stop. Spelling counts, capital letters do not.">
          <Input name="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} autoComplete="off" spellCheck={false} maxLength={200} />
        </Field>
      )}
      {!locked && <Button type="submit" disabled={pending}>{pending ? 'Checking' : asking ? 'Check answer' : 'Confirm stop'}</Button>}
      {state.message && <p role="status" className="text-body-sm">{state.message}</p>}
      {state.hint && <p className="break-words text-body-sm text-muted">Hint: {state.hint}</p>}
    </form>
  )
}
