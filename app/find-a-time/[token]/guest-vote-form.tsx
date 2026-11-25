'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input, labelClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { TIME_VOTE_CHOICES, TIME_VOTE_WORDS, type TimeVoteChoice } from '@/lib/calendar/time-votes'
import type { GuestPoll } from '@/lib/calendar/time-vote-guest'
import { answerByEmailLink } from './actions'

// The outside collaborator's half of Find a time (EMAIL-092). One row per candidate date, three
// answers each; the pressed answer is a filled button AND aria-pressed, never colour alone. Every tap
// saves at once, so there is no Submit to forget.

export function GuestVoteForm({ token, initial }: { token: string; initial: GuestPoll }) {
  const [poll, setPoll] = useState(initial)
  const [name, setName] = useState(initial.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  if (poll.options.length === 0) {
    return <p className="text-body-sm text-muted">There are no dates to pick from right now. The team may already have chosen one.</p>
  }

  const answer = (entryId: string, choice: TimeVoteChoice, current: TimeVoteChoice | null) => {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await answerByEmailLink(token, entryId, current === choice ? null : choice, name)
      if (isError(res)) setError(res.error)
      else {
        setPoll(res.data)
        setSaved(true)
      }
    })
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <label htmlFor="find-a-time-name" className={labelClasses}>
          Your name (so the team knows who answered)
        </label>
        <Input id="find-a-time-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={poll.email} />
      </div>
      <ul className="grid gap-2">
        {poll.options.map((o) => (
          <li key={o.entryId} className="rounded-control border border-border px-3 py-2">
            <p className="text-body-sm font-medium">{o.whenLabel}</p>
            <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={`Your answer for ${o.whenLabel}`}>
              {TIME_VOTE_CHOICES.map((c) => (
                <Button
                  key={c}
                  type="button"
                  size="sm"
                  variant={o.mine === c ? 'primary' : 'ghost'}
                  aria-pressed={o.mine === c}
                  disabled={pending}
                  onClick={() => answer(o.entryId, c, o.mine)}
                >
                  {TIME_VOTE_WORDS[c]}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-meta text-muted" role="status" aria-live="polite">
        {saved ? 'Saved. The team can see your answers.' : 'Each answer saves as soon as you tap it.'}
      </p>
      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
