'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { TIME_VOTE_CHOICES, TIME_VOTE_WORDS, tallyLine, type TimeVoteChoice } from '@/lib/calendar/time-votes'
import {
  addSuggestedTime,
  castTimeVote,
  loadFindATime,
  suggestPlanTimes,
  type FindATimeView,
  type TimeSuggestionView,
} from './find-time-actions'

// FIND A TIME (LIVE-2531). The Plan drawer's poll over its candidate dates: everyone on the team
// answers each one Yes, If need be or No, and the list reads best first. The answer the caller
// already gave is the pressed button, so changing your mind is one tap, and tapping it again takes
// it back. A state is never colour alone: the pressed answer is a filled button AND aria-pressed,
// and every option prints its tally in words.

export function FindATimePanel({ slug, planId }: { slug: string; planId: string }) {
  const [view, setView] = useState<FindATimeView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  // VERA'S TIMES (LIVE-2532): a proposal until someone adds one as an option.
  const [suggestions, setSuggestions] = useState<TimeSuggestionView | null>(null)

  useEffect(() => {
    let live = true
    loadFindATime(slug, planId)
      .then((res) => {
        if (!live) return
        if (isError(res)) setError(res.error)
        else setView(res.data)
      })
      .catch(() => {
        if (live) setError('The dates could not be read.')
      })
    return () => {
      live = false
    }
  }, [slug, planId])

  if (!view) return error ? <p className="text-meta text-danger">{error}</p> : null
  // A Plan with one date (or none) has nothing to vote between yet; Vera can still offer times.
  const polling = view.options.length >= 2

  const askVera = () => {
    setError(null)
    start(async () => {
      const res = await suggestPlanTimes(slug, planId)
      if (isError(res)) setError(res.error)
      else setSuggestions(res.data)
    })
  }
  const addOption = (startsAt: string, durationMin: number) => {
    setError(null)
    start(async () => {
      const res = await addSuggestedTime(slug, planId, { startsAt, durationMin })
      if (isError(res)) setError(res.error)
      else {
        setView(res.data)
        setSuggestions((cur) =>
          cur ? { ...cur, room: Math.max(0, cur.room - 1), options: cur.options.filter((o) => o.startsAt !== startsAt) } : cur,
        )
      }
    })
  }

  const answer = (entryId: string, choice: TimeVoteChoice, current: TimeVoteChoice | null) => {
    setError(null)
    start(async () => {
      const res = await castTimeVote(slug, planId, { entryId, choice: current === choice ? null : choice })
      if (isError(res)) setError(res.error)
      else setView(res.data)
    })
  }

  return (
    <div className="grid gap-2" data-find-a-time>
      <div>
        <p className="font-medium">Find a time</p>
        <p className="text-meta text-muted">
          {polling
            ? `Say which dates work for you. The best date is listed first.${view.voters > 0 ? ` ${view.voters} ${view.voters === 1 ? 'person has' : 'people have'} answered.` : ''}`
            : 'Hold two or three dates and the team can say which works. Vera can suggest times.'}
        </p>
      </div>
      {polling && (
      <ul className="grid gap-2">
        {view.options.map((o) => (
          <li key={o.entryId} className="rounded-control border border-border px-3 py-2" data-time-option={o.entryId}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body-sm">
                <span className="font-medium">{o.whenLabel}</span>
                {o.best && <span className="ml-2 rounded-pill bg-success-bg px-1.5 py-0.5 text-meta font-medium text-success">Best so far</span>}
              </span>
              <span className="flex gap-1" role="group" aria-label={`Your answer for ${o.whenLabel}`}>
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
              </span>
            </div>
            <p className="mt-1 text-meta text-muted" title={describeNames(o.names)}>
              {tallyLine(o)}
              {o.requiredNo ? ' · the Plan lead cannot make it' : ''}
            </p>
          </li>
        ))}
      </ul>
      )}
      <div>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={askVera} data-vera-suggest-times>
          Ask Vera for times
        </Button>
      </div>
      {suggestions && (
        <div className="rounded-control border border-border px-3 py-2 text-body-sm" data-vera-times>
          <p className="font-medium">Proposal. Nothing is booked.</p>
          {suggestions.forNames.length > 0 && (
            <p className="text-meta text-muted">Planned around {suggestions.forNames.join(', ')}.</p>
          )}
          {suggestions.options.length === 0 ? (
            <p className="mt-1 text-muted">No free time in the next three weeks suits everyone. Try fewer people or a shorter length.</p>
          ) : (
            <ul className="mt-1 grid gap-2">
              {suggestions.options.map((o) => (
                <li key={o.startsAt} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{o.whenLabel}</span>
                    <span className="block text-meta text-muted">{o.reason}</span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending || suggestions.room === 0}
                    onClick={() => addOption(o.startsAt, o.durationMin)}
                  >
                    Add as an option
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {suggestions.room === 0 && suggestions.options.length > 0 && (
            <p className="mt-1 text-meta text-muted">This Plan already holds three dates. Remove one to add another.</p>
          )}
        </div>
      )}
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}

function describeNames(names: Record<TimeVoteChoice, string[]>): string {
  return TIME_VOTE_CHOICES.filter((c) => names[c].length)
    .map((c) => `${TIME_VOTE_WORDS[c]}: ${names[c].join(', ')}`)
    .join('. ')
}
