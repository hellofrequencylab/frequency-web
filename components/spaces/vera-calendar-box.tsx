'use client'

import { useEffect, useId, useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  describeChange,
  destructiveConfirmation,
  isDestructiveChange,
  isVeraMode,
  VERA_MODE_OPTIONS,
  VERA_SUGGESTIONS,
  VERA_UNDO_HINT,
  type VeraChange,
  type VeraDescribeContext,
  type VeraMode,
} from '@/lib/calendar/vera-command'
import { shortDateLabel } from '@/lib/calendar/short-date'
import { newDateZone } from '@/lib/calendar/browser-zone'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { SpacePlan } from '@/lib/calendar/plans'
import {
  applyVeraChanges,
  listVeraChangeLog,
  undoVeraChanges,
  veraCalendarCommand,
  type VeraApplyResult,
  type VeraCommandResult,
  type VeraLogEntry,
} from '@/app/(main)/spaces/[slug]/settings/calendar/vera-calendar-actions'

// ASK VERA (PROG-CAL10). A disclosure row above the calendar panels, for the team that can edit
// the calendar. Type what should happen in plain words, pick the stage new things start in, and
// Vera answers with a PROPOSAL: one line per change, each with a box. Accept applies the ticked
// lines through the existing calendar actions; Discard throws the proposal away. Nothing here
// publishes, and nothing changes until Accept (ADR-1386 invariant 1).
//
// TWO GATES, NOT ONE (owner ruling: Vera changes nothing without explicit permission). Every line
// used to arrive ticked, so Accept was an apply-all with an archive sitting in it. Now a
// DESTRUCTIVE line (archive, or a stage move to Cancelled) arrives UNTICKED, and ticking it reveals
// a SECOND checkbox directly under it whose visible words are the consequence: what is deleted, and
// that there is no restore control. Accept stays out of reach until that box is ticked too, and a
// sentence beside it says why. The second box is a real `<input type="checkbox">` with a visible
// label, so Tab reaches it, Space toggles it, and the words a person reads are the words a screen
// reader announces. The list above is `aria-live="polite"`, so the confirmation is announced as it
// appears. `applyVeraChanges` refuses the same line on its own, so this is the courteous half of
// the gate, not the whole of it.
//
// WHAT A LINE SAYS IS THE SERVER'S (PROG-CAL10). `describeChange` never renders model text, and the
// context it reads is the one the proposal came back with: the server knows every title it named
// and how much a `field` line would overwrite. The month this box happens to be holding is merged
// underneath as a fallback and nothing more.
//
// WHAT VERA CHANGED, AND UNDO (PROG-CAL11 slice 3). Under the ask is a disclosure holding the
// change log: one group per accepted batch, every line the sentence the SERVER wrote when the
// change landed, and a line that could not be reversed saying so in its own words. Undo on a batch
// is not a button that acts: it asks the server for the reverses and drops them into this box as an
// ordinary PROPOSAL, with the same lines, the same ticking and the same second box on anything
// destructive. Nothing leaves the log: a batch that was undone says so and keeps its lines.
//
// CLARIFY BEFORE PROPOSING (PROG-CAL11 slice 1). When the ask is ambiguous, Vera answers with a
// QUESTION instead: it renders under [data-vera-clarification] with the options as buttons (and a
// free-text field when she allows one). Choosing one sends the transcript she returned plus the
// answer back through the same action, and the reply is a proposal or, at most once more, another
// question. The transcript lives in this component's state and nowhere else: Start over drops it.

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

type Proposal = {
  changes: VeraChange[]
  note: string
  /** Set when this proposal is an Undo: the batch it reverses, sent back on Accept. */
  undoOf?: string
  /** Ticked, per line. A destructive line starts false: apply-all is not a default. */
  checked: boolean[]
  /** The destructive line's own confirmation, per line. Cleared whenever its line is unticked. */
  confirmed: boolean[]
  /** The titles and current values the server returned with this proposal. */
  context: VeraDescribeContext
}

const EMPTY_CONTEXT: VeraDescribeContext = { plans: {}, entries: {} }
/** Vera's question as the action returns it, minus the zone the proposal path carries. */
type Clarification = Omit<Extract<VeraCommandResult, { kind: 'clarification' }>, 'timeZone'>

export function VeraCalendarBox({
  slug,
  year,
  month1,
  plans,
  events,
  spaceTimeZone = null,
  onApplied,
}: {
  slug: string
  year: number
  month1: number
  plans: SpacePlan[]
  events: CalendarEvent[]
  /** The Space's own zone (spaces.time_zone, LIVE-471). Every date Vera proposes is read and written
   *  in it; the viewer's browser zone decides only when the Space has never said. */
  spaceTimeZone?: string | null
  /** Called once at least one change landed, so the shell can refresh what it derives. */
  onApplied?: (results: VeraApplyResult[]) => void
}) {
  const panelId = useId()
  const questionId = useId()
  const logId = useId()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<VeraMode>(() => (typeof window === 'undefined' ? 'pencil' : (rememberedMode(slug) ?? 'pencil')))
  const [ask, setAsk] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [clarification, setClarification] = useState<Clarification | null>(null)
  const [freeText, setFreeText] = useState('')
  const [results, setResults] = useState<VeraApplyResult[] | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [logEntries, setLogEntries] = useState<VeraLogEntry[] | null>(null)
  const [logVersion, setLogVersion] = useState(0)
  const [logError, setLogError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const ctx = useMemo(() => {
    const planTitles: Record<string, string> = {}
    for (const p of plans) planTitles[p.id] = p.title
    const entryTitles: Record<string, string> = {}
    for (const e of events) if (e.entryId) entryTitles[e.entryId] = e.title
    return { plans: planTitles, entries: entryTitles }
  }, [plans, events])

  // What the lines read: the server's context, with the month this box holds merged underneath so
  // a line is never left nameless if the proposal came back without one.
  const previewCtx = useMemo<VeraDescribeContext>(
    () => ({
      plans: { ...ctx.plans, ...(proposal?.context.plans ?? {}) },
      entries: { ...ctx.entries, ...(proposal?.context.entries ?? {}) },
      current: proposal?.context.current,
    }),
    [ctx, proposal],
  )

  /** Ticked, destructive, and not yet confirmed. Accept waits for these. */
  const unconfirmed = proposal ? proposal.changes.filter((c, i) => proposal.checked[i] && isDestructiveChange(c) && !proposal.confirmed[i]).length : 0
  const needsConfirmation = unconfirmed > 0

  /** One reply, either shape, lands the same way: the other shape is cleared. */
  const receive = (data: VeraCommandResult) => {
    if (data.kind === 'clarification') {
      setProposal(null)
      setClarification({ kind: 'clarification', question: data.question, options: data.options, allowFreeText: data.allowFreeText, transcript: data.transcript })
      return
    }
    setClarification(null)
    setProposal({
      changes: data.changes,
      note: data.note,
      undoOf: data.undoOf,
      // UNTICKED WHERE IT MATTERS: a line that deletes is never armed by default.
      checked: data.changes.map((change) => !isDestructiveChange(change)),
      confirmed: data.changes.map(() => false),
      context: data.context ?? EMPTY_CONTEXT,
    })
  }

  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const text = ask.trim()
    if (!text || pending) return
    setError(null)
    setResults(null)
    setClarification(null)
    setFreeText('')
    start(async () => {
      const res = await veraCalendarCommand(slug, { ask: text, mode, year, month1, timeZone: newDateZone(spaceTimeZone) })
      if ('error' in res) {
        setProposal(null)
        setError(res.error)
        return
      }
      receive(res.data)
    })
  }

  /** Answer Vera's question: the transcript she returned goes back with the answer, and nothing
   *  else is kept. The ask text stays in the field in case the person wants to rephrase it. */
  const answer = (value: string) => {
    const text = value.trim()
    if (!clarification || !text || pending) return
    setError(null)
    setResults(null)
    setFreeText('')
    start(async () => {
      const res = await veraCalendarCommand(slug, {
        ask: ask.trim(),
        mode,
        year,
        month1,
        timeZone: newDateZone(spaceTimeZone),
        transcript: clarification.transcript,
        answer: text,
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      receive(res.data)
    })
  }

  const answerFreeText = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    answer(freeText)
  }

  const startOver = () => {
    setClarification(null)
    setFreeText('')
    setProposal(null)
    setResults(null)
    setError(null)
  }

  const accept = () => {
    if (!proposal || pending || needsConfirmation) return
    const pickedIndexes = proposal.changes.map((_, i) => i).filter((i) => proposal.checked[i])
    const picked = pickedIndexes.map((i) => proposal.changes[i])
    if (picked.length === 0) return
    // The confirmations are sent as positions in the PICKED list, which is the list the action
    // parses. A destructive line whose position is missing is refused there, not here.
    const confirmed = pickedIndexes.map((i, at) => (proposal.confirmed[i] ? at : -1)).filter((at) => at >= 0)
    setError(null)
    setLogError(null)
    start(async () => {
      const res = await applyVeraChanges(slug, picked, confirmed, proposal.undoOf)
      if ('error' in res) {
        setError(res.error)
        return
      }
      // Results index the PICKED list; map them back onto the proposal's lines.
      const mapped = res.data.results.map((r) => ({ ...r, index: pickedIndexes[r.index] ?? r.index }))
      setResults(mapped)
      // A batch that landed but was not written to the log is said out loud rather than left to be
      // discovered when Undo does not offer it.
      if (res.data.logError) setLogError(res.data.logError)
      if (mapped.some((r) => r.ok)) {
        onApplied?.(mapped)
        setLogVersion((v) => v + 1)
      }
    })
  }

  /** Undo a batch: the server hands back the reverses and they land here as an ordinary proposal,
   *  which still has to be ticked and accepted. Nothing is reversed by pressing this. */
  const undo = (id: string) => {
    if (pending) return
    setError(null)
    setResults(null)
    setClarification(null)
    start(async () => {
      const res = await undoVeraChanges(slug, id)
      if ('error' in res) {
        setError(res.error)
        return
      }
      receive(res.data)
    })
  }

  const discard = () => {
    setProposal(null)
    setResults(null)
    setError(null)
  }

  // The log is read only when its disclosure is open, and again after a batch lands, so the
  // ordinary path (ask, accept) costs no extra round trip.
  useEffect(() => {
    if (!logOpen) return
    let live = true
    void listVeraChangeLog(slug).then((res) => {
      if (!live) return
      if ('error' in res) setLogEntries([])
      else setLogEntries(res.data.entries)
    })
    return () => {
      live = false
    }
  }, [logOpen, slug, logVersion])

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

  // THE SUGGESTED TEXT IS A PROMPT YOU CAN PRESS (LIVE-485, owner ask 2026-09-23). The collapsed row
  // used to read "Pencil, move or retitle in plain words", which names three verbs and teaches none
  // of them. It now shows a real ask, and opening the box offers the whole set as chips: pressing
  // one FILLS THE FIELD and never sends it, and each carries the tooltip that says what the
  // proposal would hold. The list is lib/calendar/vera-command.ts, beside the changes it maps to,
  // so a suggestion can never drift into something Vera cannot do.
  const lead = VERA_SUGGESTIONS[0]

  return (
    <section
      data-vera-calendar-box
      // MORE PROMINENT (owner ask 2026-09-23). Vera's own tint and a real elevation, so the box
      // reads as the door it is rather than as one more bordered card at the foot of the column.
      className="rounded-card border border-primary/30 bg-surface lift-1"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-card px-4 py-3 text-left transition-colors hover:bg-surface-elevated"
      >
        <span className="flex min-w-0 items-center gap-2 text-body font-semibold text-text">
          <Sparkles className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          Ask Vera
        </span>
        <span data-vera-lead className="min-w-0 truncate text-meta text-muted" title={open ? undefined : lead.does}>
          {open ? 'Hide' : `Try: ${lead.ask.toLowerCase()}`}
        </span>
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
                  placeholder={lead.ask}
                  onChange={(e) => setAsk(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={pending || !ask.trim()}>
                {pending && !proposal && !clarification ? 'Asking' : 'Send'}
              </Button>
            </div>
            {/* THE SUGGESTED TEXT. Each chip fills the field and stops there, so the person still
                reads what they are about to send and can change a word of it first. The visible
                words ARE the accessible name, and the tooltip is the extra sentence rather than a
                replacement for it (WCAG 2.5.3). */}
            <div data-vera-suggestions role="group" aria-label="Things to ask Vera" className="flex flex-wrap items-center gap-1.5">
              {VERA_SUGGESTIONS.map((s) => (
                <button
                  key={s.ask}
                  type="button"
                  title={s.does}
                  disabled={pending}
                  onClick={() => setAsk(s.ask)}
                  className="tap-target rounded-pill border border-border px-3 py-1 text-meta text-muted transition-colors hover:border-border-strong hover:bg-surface-elevated hover:text-text disabled:opacity-50"
                >
                  {s.ask}
                </button>
              ))}
            </div>
            <p className="text-meta text-muted">
              Vera proposes and you decide. Nothing changes until you accept it, and nothing here publishes an event. Anything that deletes arrives unticked and asks you to confirm it in so many words. New moons and full moons are computed, not guessed. {VERA_UNDO_HINT}
            </p>
          </form>
          {error ? (
            <p role="alert" className="text-body-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          {logError ? (
            <p role="status" className="text-body-sm text-text">
              {logError}
            </p>
          ) : null}
          {clarification ? (
            <div data-vera-clarification role="group" aria-labelledby={questionId} className="space-y-3">
              <p id={questionId} className="text-body-sm text-text">
                {clarification.question}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {clarification.options.map((option) => (
                  <Button key={option.value} type="button" variant="secondary" size="sm" disabled={pending} onClick={() => answer(option.value)}>
                    {option.label}
                  </Button>
                ))}
              </div>
              {clarification.allowFreeText ? (
                <form onSubmit={answerFreeText} className="flex flex-wrap items-end gap-2">
                  <Field label="Or say it your way" className="min-w-0 flex-1">
                    <Input
                      id="vera-answer"
                      value={freeText}
                      disabled={pending}
                      maxLength={600}
                      autoComplete="off"
                      onChange={(e) => setFreeText(e.target.value)}
                    />
                  </Field>
                  <Button type="submit" variant="secondary" disabled={pending || !freeText.trim()}>
                    Answer
                  </Button>
                </form>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={startOver} disabled={pending}>
                  Start over
                </Button>
                {pending ? <span className="text-meta text-muted">Asking</span> : null}
              </div>
            </div>
          ) : null}
          {proposal ? (
            <div data-vera-proposal className="space-y-3">
              {proposal.note ? <p className="text-body-sm text-text">{proposal.note}</p> : null}
              {/* Live so each line's result is read as it lands; focusable so Accept can hand
                  focus here (see linesRef). */}
              <ul ref={linesRef} tabIndex={-1} aria-live="polite" data-vera-lines className="space-y-2 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {proposal.changes.map((change, i) => {
                  const r = resultFor(i)
                  // A destructive line's confirmation appears only once the line itself is ticked,
                  // and unticking the line takes the confirmation back with it.
                  const confirm = proposal.checked[i] ? destructiveConfirmation(change, previewCtx) : null
                  return (
                    <li key={i} className="space-y-1">
                      <Checkbox
                        label={describeChange(change, previewCtx)}
                        checked={proposal.checked[i]}
                        disabled={pending || done}
                        onChange={(e) => {
                          const checked = proposal.checked.slice()
                          checked[i] = e.target.checked
                          const confirmed = proposal.confirmed.slice()
                          if (!e.target.checked) confirmed[i] = false
                          setProposal({ ...proposal, checked, confirmed })
                        }}
                      />
                      {confirm ? (
                        <div className="pl-7" data-vera-confirm={i}>
                          <Checkbox
                            label={confirm.label}
                            hint={confirm.detail}
                            checked={proposal.confirmed[i]}
                            disabled={pending || done}
                            onChange={(e) => {
                              const confirmed = proposal.confirmed.slice()
                              confirmed[i] = e.target.checked
                              setProposal({ ...proposal, confirmed })
                            }}
                          />
                        </div>
                      ) : null}
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
                    <Button type="button" onClick={accept} disabled={pending || !anyChecked || needsConfirmation}>
                      Accept
                    </Button>
                    <Button type="button" variant="secondary" onClick={discard} disabled={pending}>
                      Discard
                    </Button>
                    {/* Why Accept is out of reach, in the same place a person is looking. */}
                    {needsConfirmation ? (
                      <span className="text-body-sm text-text">
                        {unconfirmed === 1
                          ? 'Tick the confirmation under the marked line before you accept.'
                          : 'Tick the confirmation under each marked line before you accept.'}
                      </span>
                    ) : null}
                  </>
                )}
                {/* Always mounted: a live region only announces changes to what it already holds. */}
                <span role="status" className="text-meta text-muted">
                  {pending ? 'Working' : null}
                </span>
              </div>
            </div>
          ) : null}
          {/* THE CHANGE LOG (PROG-CAL11 slice 3). Its own disclosure, closed by default and read
              only when it is opened, so the ordinary ask-and-accept path costs no extra round
              trip. Every batch stays here, the undone ones included. */}
          <div data-vera-log className="space-y-2 border-t border-border pt-3">
            <button
              type="button"
              aria-expanded={logOpen}
              aria-controls={logId}
              onClick={() => setLogOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="text-body-sm font-semibold text-text">What Vera changed</span>
              <span className="text-meta text-muted">{logOpen ? 'Hide' : 'Show the record'}</span>
            </button>
            {logOpen ? (
              <ul id={logId} className="space-y-2">
                {(logEntries ?? []).length === 0 ? (
                  <li className="text-meta text-muted">
                    {logEntries === null
                      ? 'Reading the record.'
                      : 'Nothing accepted here yet. Every batch you accept is kept, along with what it would take to put it back.'}
                  </li>
                ) : (
                  (logEntries ?? []).map((entry) => (
                    <li key={entry.id} data-vera-log-entry={entry.id} className="space-y-1 rounded-card border border-border p-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <time dateTime={entry.at} className="text-meta font-semibold text-text">
                          {shortDateLabel(entry.at.slice(0, 10))}
                          {entry.undoOf ? ', an undo' : ''}
                        </time>
                        {/* One slot, whatever it holds: a batch that was undone says so, a batch
                            with nothing reversible says that, and the rest offer Undo. */}
                        <span className="text-meta text-muted">
                          {entry.undoneBy ? (
                            'Undone'
                          ) : entry.reversible === 0 ? (
                            'Nothing here can be put back'
                          ) : (
                            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => undo(entry.id)}>
                              Undo
                            </Button>
                          )}
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {entry.lines.map((line, i) => (
                          <li key={i} className="text-meta text-muted">
                            {line.message}
                            {line.reason ? <span className="block">{line.reason}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
