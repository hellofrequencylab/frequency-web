'use client'

import { useEffect, useId, useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { describeChange, isVeraMode, VERA_MODE_OPTIONS, type VeraChange, type VeraMode } from '@/lib/calendar/vera-command'
import { browserZone } from '@/lib/calendar/browser-zone'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { SpacePlan } from '@/lib/calendar/plans'
import {
  applyVeraChanges,
  veraCalendarCommand,
  type VeraApplyResult,
} from '@/app/(main)/spaces/[slug]/settings/calendar/vera-calendar-actions'

// ASK VERA (PROG-CAL10). A disclosure row above the calendar panels, for the team that can edit
// the calendar. Type what should happen in plain words, pick the stage new things start in, and
// Vera answers with a PROPOSAL: one line per change, each with a box. Accept applies the ticked
// lines through the existing calendar actions; Discard throws the proposal away. Nothing here
// publishes, and nothing changes until Accept (ADR-1386 invariant 1).

const MODE_KEY = (slug: string) => `vera-calendar-mode:${slug}`

function rememberedMode(slug: string): VeraMode | null {
  try {
    const v = window.localStorage.getItem(MODE_KEY(slug))
    return isVeraMode(v) ? v : null
  } catch {
    return null
  }
}

function rememberMode(slug: string, mode: VeraMode) {
  try {
    window.localStorage.setItem(MODE_KEY(slug), mode)
  } catch {
    /* a private window is fine; the default is Pencil */
  }
}

type Proposal = { changes: VeraChange[]; note: string; checked: boolean[] }

export function VeraCalendarBox({
  slug,
  year,
  month1,
  plans,
  events,
  onApplied,
}: {
  slug: string
  year: number
  month1: number
  plans: SpacePlan[]
  events: CalendarEvent[]
  /** Called once at least one change landed, so the shell can refresh what it derives. */
  onApplied?: (results: VeraApplyResult[]) => void
}) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<VeraMode>(() => (typeof window === 'undefined' ? 'pencil' : (rememberedMode(slug) ?? 'pencil')))
  const [ask, setAsk] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [results, setResults] = useState<VeraApplyResult[] | null>(null)
  const [pending, start] = useTransition()

  const ctx = useMemo(() => {
    const planTitles: Record<string, string> = {}
    for (const p of plans) planTitles[p.id] = p.title
    const entryTitles: Record<string, string> = {}
    for (const e of events) if (e.entryId) entryTitles[e.entryId] = e.title
    return { plans: planTitles, entries: entryTitles }
  }, [plans, events])

  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const text = ask.trim()
    if (!text || pending) return
    setError(null)
    setResults(null)
    start(async () => {
      const res = await veraCalendarCommand(slug, { ask: text, mode, year, month1, timeZone: browserZone() })
      if ('error' in res) {
        setProposal(null)
        setError(res.error)
        return
      }
      setProposal({ changes: res.data.changes, note: res.data.note, checked: res.data.changes.map(() => true) })
    })
  }

  const accept = () => {
    if (!proposal || pending) return
    const picked = proposal.changes.filter((_, i) => proposal.checked[i])
    if (picked.length === 0) return
    setError(null)
    start(async () => {
      const res = await applyVeraChanges(slug, picked)
      if ('error' in res) {
        setError(res.error)
        return
      }
      // Results index the PICKED list; map them back onto the proposal's lines.
      const pickedIndexes = proposal.changes.map((_, i) => i).filter((i) => proposal.checked[i])
      const mapped = res.data.results.map((r) => ({ ...r, index: pickedIndexes[r.index] ?? r.index }))
      setResults(mapped)
      if (mapped.some((r) => r.ok)) onApplied?.(mapped)
    })
  }

  const discard = () => {
    setProposal(null)
    setResults(null)
    setError(null)
  }

  const resultFor = (i: number) => results?.find((r) => r.index === i) ?? null
  const anyChecked = proposal?.checked.some(Boolean) ?? false
  const done = results !== null

  // FOCUS LANDS ON THE RESULTS (LIVE-469). Accept is replaced by Clear the moment the results
  // arrive, and the focus that pressed it would fall to the body. The list of lines (each now
  // carrying its result) takes it instead, so the next Tab is Clear and a screen reader is
  // already on what changed.
  const linesRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (done) linesRef.current?.focus()
  }, [done])

  return (
    <section data-vera-calendar-box className="rounded-card border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-body font-semibold text-text">Ask Vera</span>
        <span className="text-meta text-muted">{open ? 'Hide' : 'Pencil, move or retitle in plain words'}</span>
      </button>
      {open ? (
        <div id={panelId} className="space-y-3 border-t border-border px-4 py-3">
          <form onSubmit={send} className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Stage" className="w-40">
                <Select
                  id="vera-mode"
                  options={VERA_MODE_OPTIONS}
                  value={mode}
                  disabled={pending}
                  onChange={(e) => {
                    const next = e.target.value
                    if (isVeraMode(next)) {
                      setMode(next)
                      rememberMode(slug, next)
                    }
                  }}
                />
              </Field>
              <Field label="What should happen" className="min-w-0 flex-1">
                <Input
                  id="vera-ask"
                  value={ask}
                  disabled={pending}
                  maxLength={600}
                  autoComplete="off"
                  placeholder="Pencil a sound bath on every new moon this winter"
                  onChange={(e) => setAsk(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={pending || !ask.trim()}>
                {pending && !proposal ? 'Asking' : 'Send'}
              </Button>
            </div>
            <p className="text-meta text-muted">
              Vera proposes and you decide. Nothing changes until you accept it, and nothing here publishes an event. New moons and full moons are computed, not guessed.
            </p>
          </form>
          {error ? (
            <p role="alert" className="text-body-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          {proposal ? (
            <div data-vera-proposal className="space-y-3">
              {proposal.note ? <p className="text-body-sm text-text">{proposal.note}</p> : null}
              {/* Live so each line's result is read as it lands; focusable so Accept can hand
                  focus here (see linesRef). */}
              <ul ref={linesRef} tabIndex={-1} aria-live="polite" data-vera-lines className="space-y-2 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {proposal.changes.map((change, i) => {
                  const r = resultFor(i)
                  return (
                    <li key={i} className="space-y-1">
                      <Checkbox
                        label={describeChange(change, ctx)}
                        checked={proposal.checked[i]}
                        disabled={pending || done}
                        onChange={(e) => {
                          const checked = proposal.checked.slice()
                          checked[i] = e.target.checked
                          setProposal({ ...proposal, checked })
                        }}
                      />
                      {r ? (
                        <p className={cn('pl-7 text-meta', r.ok ? 'text-success' : 'text-danger')}>{r.message}</p>
                      ) : done && !proposal.checked[i] ? (
                        <p className="pl-7 text-meta text-muted">Left alone.</p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                {done ? (
                  <Button type="button" variant="secondary" onClick={discard}>
                    Clear
                  </Button>
                ) : (
                  <>
                    <Button type="button" onClick={accept} disabled={pending || !anyChecked}>
                      Accept
                    </Button>
                    <Button type="button" variant="secondary" onClick={discard} disabled={pending}>
                      Discard
                    </Button>
                  </>
                )}
                {/* Always mounted: a live region only announces changes to what it already holds. */}
                <span role="status" className="text-meta text-muted">
                  {pending ? 'Working' : null}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
