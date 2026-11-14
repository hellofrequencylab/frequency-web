'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { saveLoomFunctionAction, type ComposerState } from './actions'

const START: ComposerState = { ok: false, message: '', problems: [] }

/** The declaration editor. It sends JSON data only; the store's validator decides whether it is kept. */
export function ComposerForm({ spaceId, starter }: { spaceId?: string; starter: string }) {
  const [state, action, pending] = useActionState(saveLoomFunctionAction, START)
  return (
    <form action={action} className="space-y-3">
      {spaceId ? <input type="hidden" name="space" value={spaceId} /> : null}
      <Field label="Surface" hint="Where the function is used, like page or site.">
        <Input name="surface" defaultValue="page" required />
      </Field>
      <Field label="Declaration" hint="JSON data built from the primitives listed here. No code.">
        <Textarea name="declaration" rows={16} defaultValue={starter} spellCheck={false} className="font-mono text-body-sm" />
      </Field>
      <Button type="submit" loading={pending} disabled={pending}>Check and save</Button>
      <div role="status" className="space-y-1 text-body-sm">
        {state.message ? <p className={state.ok ? 'text-success' : 'text-danger'}>{state.message}</p> : null}
        {state.problems.length ? (
          <ul className="list-disc space-y-1 pl-5 text-muted">
            {state.problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        ) : null}
      </div>
    </form>
  )
}
