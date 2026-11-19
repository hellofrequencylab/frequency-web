'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Sparkles, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { capsLabel } from '@/components/ui/caps-label'
import { choiceTileClasses } from '@/components/ui/choice-tile'
import { isError, type ActionResult } from '@/lib/action-result'
import {
  recommendTimerPicks,
  resolveTimerPicks,
  type TimerPick,
  type TimerSetupId,
  type TimerSignals,
  type TimerSuggestion,
} from '@/lib/practices/timer-setups'

// SUGGESTED TIMER SETUPS (LIVE-2396). Up to three ready-made timer configurations matched to what
// the author wrote, each one tap to apply. Shared by the Practice editor and the create flow.
//
// The cards are live from the first render: the offline recommender ranks the catalog against the
// author's own words as they type, so nothing waits on a model. "Ask Vera" is the optional second
// read. Vera only ever answers with IDs from the same catalog (ADR-1939, ruling 4), so every word
// on these cards is reviewed copy, and nothing is applied until the author taps one.

/** The read-only server action, passed in by the page so this stays a pure client component. */
export type SuggestTimer = (signals: TimerSignals) => Promise<ActionResult<{ picks: TimerPick[]; vera: boolean }>>

export function TimerSuggestions({
  signals,
  appliedId,
  onApply,
  suggest,
  disabled,
  autoAsk,
  onFirst,
  hint,
}: {
  signals: TimerSignals
  /** The setup the author last applied, so its card reads as chosen. */
  appliedId: TimerSetupId | null
  onApply: (suggestion: TimerSuggestion) => void
  suggest?: SuggestTimer
  disabled?: boolean
  /** Ask Vera once when the cards first show. For the create flow, where the author has just
   *  asked Vera to look; the editor leaves it to the button so opening it never costs a call. */
  autoAsk?: boolean
  /** Reports the best fit whenever it changes, for a surface that sets it by default. */
  onFirst?: (suggestion: TimerSuggestion) => void
  /** The line under the cards. Defaults to the editor's. */
  hint?: string
}) {
  const [veraPicks, setVeraPicks] = useState<TimerPick[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const { title, summary, description, body, durationMin } = signals
  const matched = useMemo(
    () => recommendTimerPicks({ title, summary, description, body, durationMin }),
    [title, summary, description, body, durationMin],
  )
  const suggestions = resolveTimerPicks(veraPicks ?? matched)

  const askVera = () => {
    if (!suggest) return
    setNote(null)
    start(async () => {
      const res = await suggest({ title, summary, description, body, durationMin })
      if (isError(res)) { setNote('Vera could not look right now. These are matched to your words.'); return }
      setVeraPicks(res.data.vera ? res.data.picks : null)
      setNote(res.data.vera ? 'Vera picked these from what you wrote.' : 'Vera is off right now. These are matched to your words.')
    })
  }

  const asked = useRef(false)
  useEffect(() => {
    if (!autoAsk || asked.current) return
    asked.current = true
    askVera()
    // Once, on first show. askVera reads the words as they are at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAsk])

  const first = suggestions[0]
  const firstKey = first ? `${first.id}:${first.patch.duration_min ?? ''}` : ''
  const latestFirst = useRef(first)
  useEffect(() => { latestFirst.current = first })
  useEffect(() => {
    if (onFirst && latestFirst.current) onFirst(latestFirst.current)
    // Keyed on the best fit itself, so a parent re-render never re-reports the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={capsLabel('inline-flex items-center gap-1.5 text-2xs font-semibold text-muted')}>
          <Sparkles className="h-3.5 w-3.5 text-primary-strong" aria-hidden /> Suggested setups
        </p>
        {suggest && (
          <Button type="button" variant="ghost" size="sm" disabled={pending || disabled} onClick={askVera}>
            {pending ? 'Vera is reading…' : 'Ask Vera'}
          </Button>
        )}
      </div>
      <div role="group" aria-label="Suggested timer setups" className="mt-2 grid gap-2 sm:grid-cols-3">
        {suggestions.map((s) => {
          const chosen = appliedId === s.id
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={chosen}
              disabled={disabled}
              onClick={() => onApply(s)}
              className={choiceTileClasses(chosen, 'flex min-h-11 flex-col items-start gap-1 rounded-control px-3 py-2.5 text-left')}
            >
              <span className={`inline-flex items-center gap-1.5 text-body-sm font-semibold ${chosen ? 'text-primary-strong' : 'text-text'}`}>
                {chosen && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                {s.label}
              </span>
              <span className="text-meta font-medium text-muted">{s.preview}</span>
              <span className="text-meta text-subtle">{s.reason}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-meta text-subtle" role="status">
        {note ?? hint ?? 'Tap one to set the timer. You can change anything after.'}
      </p>
    </div>
  )
}
