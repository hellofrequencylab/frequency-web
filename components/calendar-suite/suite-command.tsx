'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { Input } from '@/components/ui/field'
import { VIEW_KEY, commandRows, type CommandRow } from '@/lib/calendar/planner/command-results'
import { parseCommand } from '@/lib/calendar/planner/command-parse'
import type { SuiteView } from '@/lib/calendar/planner/suite-model'
import type { PlannerItem, PlannerPlan } from '@/lib/calendar/planner/types'

// THE COMMAND BAR (README 4). Say it the way you would to a teammate: "Pencil supper club next fri
// 7pm". The bar reads the kind, the day, the time and the length, shows what it understood in plain
// words, and adds nothing until you press Enter on the create row. It also opens views, jumps to
// today, and finds Plans and dates by name. Arrow keys move, Enter runs; the mouse only picks on a click.

const EXAMPLES = [
  'Pencil supper club with Ocean House next fri 7pm',
  'Block pool deck nov 2',
  'Todo order mats tomorrow',
  'Private staff sync thu 10am for 30 min',
]

type Parsed = NonNullable<ReturnType<typeof parseCommand>>

export function SuiteCommand({
  today,
  timeZone,
  views,
  plans,
  items,
  onRun,
  onClose,
}: {
  today: string
  timeZone: string
  views: readonly SuiteView[]
  plans: readonly Pick<PlannerPlan, 'id' | 'title' | 'stage'>[]
  items: readonly Pick<PlannerItem, 'id' | 'title' | 'kind' | 'date'>[]
  /** Runs a row. A create row comes with what was parsed. Returns a sentence when it failed. */
  onRun: (row: CommandRow, parsed: Parsed | null) => Promise<string | null>
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [idx, setIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    input.current?.focus()
    return () => before?.focus?.()
  }, [])

  // The co-host list is empty until Spaces can co-host (the co-host pass), so "with Ocean House" stays in the title.
  const parsed = useMemo(() => (text.trim().length > 2 ? parseCommand(text, { today, timeZone, cohosts: [] }) : null), [text, today, timeZone])
  const rows = useMemo(
    () =>
      commandRows({
        query: text,
        create: parsed ? { kind: parsed.kind, label: parsed.rowLabel, meta: parsed.rowMeta } : null,
        views,
        plans,
        items,
      }),
    [text, parsed, views, plans, items],
  )
  const at = Math.min(idx, Math.max(0, rows.length - 1))

  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [at, rows])

  const run = async (row: CommandRow | undefined) => {
    if (!row || busy) return
    setBusy(true)
    setError('')
    const failed = await onRun(row, row.type === 'create' ? parsed : null)
    setBusy(false)
    if (failed) setError(failed)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx(Math.min(rows.length - 1, at + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx(Math.max(0, at - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void run(rows[at])
    }
  }

  return (
    <div className="cal-sheet-wrap cal-cmd-wrap" data-cal-sheet data-cal-command>
      <div className="cal-sheet-scrim" onClick={onClose} aria-hidden />
      <div className="cal-cmd fq-panel" role="dialog" aria-modal="true" aria-label="Command bar" onKeyDown={onKey}>
        <div className="cal-cmd-field">
          <FqIcon name="vera" size={18} />
          <Input
            ref={input}
            variant="seamless"
            className="cal-cmd-input placeholder:text-current/50!"
            value={text}
            placeholder="Tell Vera what to add, find or open"
            aria-label="Command"
            role="combobox"
            aria-expanded="true"
            aria-controls="cal-cmd-list"
            aria-activedescendant={rows[at] ? `cal-cmd-${rows[at].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setText(e.target.value)
              setIdx(0)
              setError('')
            }}
          />
          <kbd className="cal-kbd">esc</kbd>
        </div>

        {parsed ? (
          <section className="cal-cmd-read" aria-label="What I understood">
            <p className="cal-caps">What I understood</p>
            <dl>
              {parsed.understood.map((u) => (
                <div key={u.label} data-said={u.said || undefined}>
                  <dt>{u.label}</dt>
                  <dd>
                    {u.value}
                    {u.said ? null : <span className="cal-serif"> filled in</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {text.trim() === '' ? (
          <div className="cal-cmd-empty">
            <p className="cal-serif">Say it the way you would to a teammate. Vera works out the kind, the day, the time and who is co-hosting.</p>
            <div className="cal-cmd-ex">
              {EXAMPLES.map((ex) => (
                <button
                  type="button"
                  key={ex}
                  className="cal-cmd-chip"
                  onClick={() => {
                    setText(ex)
                    setIdx(0)
                    input.current?.focus()
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="cal-form-err" role="alert">
            {error}
          </p>
        ) : null}

        <ul className="cal-cmd-list" id="cal-cmd-list" role="listbox" aria-label="Results" ref={list}>
          {rows.map((row, i) => (
            <li key={row.id} role="presentation">
              <button
                type="button"
                role="option"
                id={`cal-cmd-${row.id}`}
                aria-selected={i === at}
                data-active={i === at}
                tabIndex={-1}
                className="cal-cmd-row"
                onClick={() => void run(row)}
              >
                {row.type === 'create' ? (
                  <i className="cal-cmd-dot" style={{ background: row.dot }} aria-hidden />
                ) : (
                  <FqIcon name={row.type === 'view' ? 'event' : row.type === 'today' ? 'clock' : row.type === 'plan' ? 'compass' : 'arrow'} size={16} />
                )}
                <span className="cal-cmd-label">{row.label}</span>
                <span className="cal-cmd-meta">{row.meta}</span>
              </button>
            </li>
          ))}
        </ul>

        <footer className="cal-cmd-foot" aria-label="Keyboard help">
          <span>
            <kbd className="cal-kbd">↑↓</kbd> move
          </span>
          <span>
            <kbd className="cal-kbd">↵</kbd> run
          </span>
          <span>
            <kbd className="cal-kbd">P</kbd> pencil it in
          </span>
          <span>
            <kbd className="cal-kbd">{views.map((v) => VIEW_KEY[v]).join(' ')}</kbd> views
          </span>
          <span>
            <kbd className="cal-kbd">T</kbd> today
          </span>
        </footer>
      </div>
    </div>
  )
}
