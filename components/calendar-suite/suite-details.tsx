'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { SeriesDeleteDialog, SeriesSaveDialog } from '@/app/(main)/spaces/[slug]/settings/calendar/series-choice-dialog'
import { FqIcon } from '@/components/frequency/icon'
import { Avatar } from '@/components/ui/avatar'
import { Button, buttonClasses } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { ProgressTrack } from '@/components/ui/progress-track'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { SuiteItem, SuitePlan, SuiteTask } from '@/lib/calendar/planner/adapters'
import { planStats, stageLabel } from '@/lib/calendar/planner/board'
import { overlapsUnavailable } from '@/lib/calendar/planner/clash'
import { hostSpaceId, isInvitePending } from '@/lib/calendar/planner/day-items'
import { clockLabel, dayLabel, lengthLabel } from '@/lib/calendar/planner/days'
import {
  lengthChoices,
  nextWeekCopy,
  offsetPhrase,
  planDoorStage,
  planItemEdit,
  startChoices,
  type EditOutcome,
  type ItemEdit,
} from '@/lib/calendar/planner/details'
import type { WriteCall } from '@/lib/calendar/planner/drop'
import { KINDS } from '@/lib/calendar/planner/kinds'
import type { PlanStage, PlannerData } from '@/lib/calendar/planner/types'
import { entryKind } from '@/lib/calendar/registry'
import { planEntryDelete } from '@/lib/calendar/series-choice'
import { productionDoorHref } from '@/lib/calendar/stage-timeline'
import type { DetailsActions, RecordSubject } from './suite-details-actions'
import { ChoiceField, DateField, Row, TextField, TodoCheck, useRun } from './suite-details-fields'
import { SuitePlanSummary } from './suite-plan-summary'
import { SuiteRecord, useRecord } from './suite-record'
import type { SuiteContext, SuiteSelection } from './suite-types'

// THE DETAILS PANEL (README 1.4). One inspector for the three things the calendar holds: a date, a
// to-do and a Plan. It states what the record is, when, and what it belongs to, and a person who can
// edit the Space changes it in place: the title is the heading, the stage is a control, the fields
// save when the person leaves them, and the buttons are the moves the record allows. A person who can
// only read sees the same panel without the controls. Every write is a server action the calendar
// already had (suite-details-actions.ts); a refusal stays on screen as the server's own sentence.

const STAGE_KIND: Record<PlanStage, keyof typeof KINDS> = {
  pencil: 'pencil',
  planning: 'planning',
  production: 'production',
  event: 'event',
  cancelled: 'cancelled',
}

/** The four stages a person can set. Published is reached by publishing the event (Go live). */
const STAGE_SEGMENTS = [
  { value: 'pencil', label: 'Pencil' },
  { value: 'planning', label: 'Planning' },
  { value: 'production', label: 'Production' },
  { value: 'cancelled', label: 'Cancelled' },
] as const
type SettableStage = (typeof STAGE_SEGMENTS)[number]['value']

const settable = (stage: string): SettableStage | null => (STAGE_SEGMENTS.some((s) => s.value === stage) ? (stage as SettableStage) : null)

/** "Wed, Oct 21, 9:30 AM to 5 PM", "Sat, Dec 5 to Sun, Dec 6, all day". */
function whenLine(item: SuiteItem): string {
  const span = item.end ? `${dayLabel(item.date)} to ${dayLabel(item.end)}` : dayLabel(item.date)
  if (item.startMin == null) return `${span}, all day`
  return `${span}, ${clockLabel(item.startMin)} to ${clockLabel(item.startMin + item.durMin)}`
}

function KindPill({ kind, children }: { kind: keyof typeof KINDS; children?: ReactNode }) {
  const look = KINDS[kind]
  return (
    <span className="cal-pill" style={{ background: look.bg, border: look.bd, color: look.fg }}>
      {children ?? look.word}
    </span>
  )
}

/** The refusal or failure of the last write, in the server's own words. */
function Problem({ line }: { line: string | null }) {
  return line ? (
    <p role="alert" className="cal-err">
      {line}
    </p>
  ) : null
}

interface PanelProps {
  data: PlannerData
  ctx: SuiteContext
  actions: DetailsActions
  onSelect: (sel: SuiteSelection) => void
  onClose: () => void
  say: (line: string, tone: 'success' | 'danger' | 'neutral') => void
}

export function SuiteDetails({ sel, ...panel }: PanelProps & { sel: SuiteSelection }) {
  const { data, ctx, actions, onSelect, onClose } = panel
  const canEdit = !!ctx.canEdit
  const item = sel?.kind === 'item' ? (ctx.itemById.get(sel.id) ?? null) : null
  const task = sel?.kind === 'todo' ? (ctx.taskById.get(sel.id) ?? null) : null
  const plan = sel?.kind === 'plan' ? (ctx.planById.get(sel.id) ?? null) : null
  const ownerPlan = ctx.planById.get(item?.plan ?? task?.plan ?? '') ?? null
  const planFor = plan ?? ownerPlan
  const [nowMs] = useState(() => Date.now())

  // A Plan speaks for every date and to-do on it. A date on no Plan keeps a record of its own.
  let subject: RecordSubject | null = null
  if (planFor) subject = isInvitePending(planFor, ctx.ownSpaceId) ? null : { kind: 'plan', id: planFor.id }
  else if (item?.entryId && !item.shared && !item.hostLabel) subject = { kind: 'entry', id: item.entryId }
  const record = useRecord(subject, actions, nowMs)

  return (
    <div className="cal-details-in">
      <header className="cal-dhead-bar">
        <div className="cal-dhead-t">
          <h2 className="cal-dtitle-bar">Details</h2>
          {record.last ? <span className="cal-serif cal-dlast">{record.last}</span> : null}
        </div>
        <IconButton label="Close details" variant="tinted" onClick={onClose}>
          <FqIcon name="close" size={16} />
        </IconButton>
      </header>
      <div className="cal-dbody" key={sel ? `${sel.kind}:${sel.id}` : 'none'}>
        {item ? <ItemBody item={item} {...panel} /> : null}
        {task ? <TodoBody task={task} {...panel} /> : null}
        {plan ? <PlanBody plan={plan} {...panel} /> : null}

        {planFor ? <SuitePlanSummary plan={planFor} bare={!!plan} data={data} ctx={ctx} actions={actions} onSelect={onSelect} /> : null}

        {subject ? (
          <SuiteRecord
            subject={subject}
            actions={actions}
            record={record}
            nowMs={nowMs}
            canPost={canEdit && !(item?.shared || item?.hostLabel)}
          />
        ) : null}

        {!item && !task && !plan ? <p className="cal-serif">Pick a date, a to-do or a Plan to see it here.</p> : null}
      </div>
    </div>
  )
}

// ── A DATE ──────────────────────────────────────────────────────────────────────────────────────

function ItemBody({ item, data, ctx, actions, onSelect, onClose, say }: PanelProps & { item: SuiteItem }) {
  const canEdit = !!ctx.canEdit
  const { error, busy, run, fail } = useRun()
  const [saveAsk, setSaveAsk] = useState<Extract<EditOutcome, { kind: 'ask' }> | null>(null)
  const [deleting, setDeleting] = useState(false)
  const input = item.entryInput
  const editable = canEdit && !!item.entryId && !!input && !item.shared && !item.hostLabel
  const hasStage = editable && !!input && !!entryKind(input.kind)?.isPencil && item.kind !== 'event'
  const timed = item.startMin != null && !item.end
  const blockers =
    ctx.clashes.has(item.id) ? data.items.filter((b) => b.kind === 'unavailable' && overlapsUnavailable(item, b)).map((b) => b.title) : []
  const deletePlan = input ? planEntryDelete({ kind: input.kind, repeat: input.repeat, occurrenceDate: item.occurrenceDate ?? item.date }) : null

  const write = async (w: { call: WriteCall; date: string }) => {
    if (await run(() => runCall(actions, w.call))) {
      if (w.date !== item.date) onSelect({ kind: 'item', id: item.id.replace(/\d{4}-\d{2}-\d{2}$/, w.date) })
    }
  }
  const edit = async (change: ItemEdit) => {
    const out = planItemEdit(item, change)
    if (out.kind === 'refused') fail(out.line)
    else if (out.kind === 'ask') setSaveAsk(out)
    else if (out.kind === 'write') await write(out.write)
  }
  const copy = async () => {
    const made = nextWeekCopy(item)
    if (!made) return
    if (await run(() => actions.saveEntry(null, made.input))) say(made.line, 'success')
  }
  const remove = async (how: 'row' | 'day') => {
    if (!item.entryId) return
    const entryId = item.entryId
    const ok = await run(() => (how === 'day' ? actions.skipDate(entryId, item.occurrenceDate ?? item.date) : actions.deleteEntry(entryId)))
    setDeleting(false)
    if (ok) {
      say(`Deleted ${item.title}.`, 'neutral')
      onClose()
    }
  }
  const goLive = item.kind === 'production' && item.entryId && canEdit ? productionDoorHref(ctx.ownSpaceId, item.entryId, item.plan) : null
  const stage = settable(item.kind)

  return (
    <>
      <div className="cal-dkind">
        <KindPill kind={item.kind} />
        {item.option ? <span className="cal-muted">Option {item.option}</span> : null}
      </div>
      {editable ? (
        <TextField
          className="cal-dtitle-in"
          heading
          label="Title"
          value={item.title}
          disabled={busy}
          onCommit={(title) => void edit({ title })}
        />
      ) : (
        <h3 className="cal-dtitle" data-struck={item.kind === 'cancelled' || undefined}>
          {item.title}
        </h3>
      )}
      <p className="cal-dwhen">
        <FqIcon name="clock" size={16} />
        {whenLine(item)}
      </p>
      {blockers.length > 0 ? (
        <p className="cal-notice" role="note">
          Overlaps {blockers.join(', ')}. Move it, or move the unavailable time.
        </p>
      ) : null}
      {hasStage ? (
        <SegmentedControl
          label="Stage"
          value={stage}
          onChange={(next) => void edit({ stage: next })}
          segments={STAGE_SEGMENTS}
        />
      ) : null}
      <dl className="cal-dl">
        <Row label="Date">
          {editable && !item.end ? (
            <DateField label="Date" value={item.date} disabled={busy} onCommit={(date) => date && void edit({ date })} />
          ) : item.end ? (
            `${dayLabel(item.date)} to ${dayLabel(item.end)}`
          ) : (
            dayLabel(item.date)
          )}
        </Row>
        {!item.end && (item.startMin != null || editable) ? (
          <Row label="Starts">
            {editable ? (
              <ChoiceField
                label="Starts"
                value={item.startMin == null ? 'all' : String(item.startMin)}
                choices={startChoices(item.startMin)}
                disabled={busy}
                onCommit={(v) => void edit({ startMin: v === 'all' ? null : Number(v) })}
              />
            ) : (
              clockLabel(item.startMin as number)
            )}
          </Row>
        ) : null}
        {timed ? (
          <Row label="Length">
            {editable ? (
              <ChoiceField
                label="Length"
                value={String(item.durMin)}
                choices={lengthChoices(item.durMin)}
                disabled={busy}
                onCommit={(v) => void edit({ durMin: Number(v) })}
              />
            ) : (
              lengthLabel(item.durMin)
            )}
          </Row>
        ) : null}
        {item.location ? <Row label="Where">{item.location}</Row> : null}
        {item.series ? <Row label="Repeats">Part of a series</Row> : null}
        {item.going ? <Row label="Going">{`${item.going} going`}</Row> : null}
        {item.note ? <Row label="Status">{item.note}</Row> : null}
      </dl>
      {editable ? (
        <div className="cal-notesf">
          <p className="cal-caps">Notes for the team</p>
          <TextField
            multiline
            label="Notes for the team"
            placeholder="Doors, setup, who brings what"
            value={input?.notes ?? item.notes ?? ''}
            disabled={busy}
            onCommit={(notes) => void edit({ notes })}
          />
        </div>
      ) : item.notes ? (
        <p className="cal-notes">{item.notes}</p>
      ) : null}
      <Problem line={error} />
      <div className="cal-actions">
        {goLive ? (
          <Link className={buttonClasses('primary', 'sm')} href={goLive}>
            Go live
          </Link>
        ) : null}
        {item.eventHref ? (
          <Link className={buttonClasses('primarySoft', 'sm')} href={item.eventHref}>
            Go to event
          </Link>
        ) : null}
        {editable ? (
          <>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void copy()}>
              Copy to next week
            </Button>
            {item.kind !== 'cancelled' ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void edit({ stage: 'cancelled' })}>
                Cancel
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="dangerOutline"
              disabled={busy}
              onClick={() => {
                if (deletePlan?.ask) setDeleting(true)
                else setDeleting((v) => !v)
              }}
            >
              Delete
            </Button>
          </>
        ) : null}
      </div>
      {deleting && !deletePlan?.ask ? (
        <div className="cal-confirm" role="group" aria-label="Delete this date">
          <p>Delete {item.title}? It leaves the team calendar.</p>
          <div className="cal-actions">
            <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => void remove('row')}>
              Delete
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setDeleting(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}
      {saveAsk ? (
        <SeriesSaveDialog
          open
          title={saveAsk.title}
          plan={saveAsk.series}
          pending={busy}
          onChoose={(choice) => {
            const ask = saveAsk
            setSaveAsk(null)
            const w = ask.choose(choice)
            if (w) void write(w)
          }}
        />
      ) : null}
      {deleting && deletePlan?.ask ? (
        <SeriesDeleteDialog
          open
          title={item.title}
          plan={deletePlan}
          pending={busy}
          onChoose={(choice) => {
            if (choice === 'keep') setDeleting(false)
            else void remove(choice === 'thisDate' ? 'day' : 'row')
          }}
        />
      ) : null}
    </>
  )
}

/** One write call of a move, run through the panel's actions. */
function runCall(actions: DetailsActions, call: WriteCall) {
  if (call.type === 'entry') return actions.saveEntry(call.entryId, call.input)
  if (call.type === 'occurrence') return actions.saveOccurrence(call.entryId, call.day, call.input)
  return actions.moveTodo(call.id, call.due)
}

// ── A TO-DO ─────────────────────────────────────────────────────────────────────────────────────

function TodoBody({ task, ctx, actions, onClose, say }: PanelProps & { task: SuiteTask }) {
  const canEdit = !!ctx.canEdit
  const { error, busy, run, fail } = useRun()
  const [deleting, setDeleting] = useState(false)
  const editable = canEdit && !task.sharedFrom
  const owner = task.owner ? ctx.teamById.get(task.owner) : null
  const late = !task.done && !!task.due && task.due < ctx.today
  const team = [...ctx.teamById.values()]

  return (
    <>
      <div className="cal-dkind">
        <KindPill kind="todo" />
        <span className="cal-muted">{task.done ? 'Done' : 'Open'}</span>
      </div>
      <div className="cal-ttitle">
        <TodoCheck done={task.done} canEdit={canEdit && !task.sharedFrom} onToggle={(next) => actions.setTodoDone(task.id, next)} onError={fail} />
        {editable ? (
          <TextField
            className="cal-dtitle-in"
            heading
            label="Title"
            value={task.title}
            disabled={busy}
            onCommit={(title) => void run(() => actions.renameTodo(task.id, title))}
          />
        ) : (
          <h3 className="cal-dtitle" data-struck={task.done || undefined}>
            {task.title}
          </h3>
        )}
      </div>
      <dl className="cal-dl">
        <Row label="Due">
          {editable ? (
            <DateField
              label="Due"
              clearable
              value={task.due ?? ''}
              disabled={busy}
              onCommit={(due) => void run(() => actions.moveTodo(task.id, due))}
            />
          ) : (
            (task.due ? dayLabel(task.due) : 'No date yet')
          )}
          {late ? <span className="cal-flag">Overdue</span> : null}
        </Row>
        {task.phase ? <Row label="Phase">{[task.phase, offsetPhrase(task.dueOffsetDays)].filter(Boolean).join(', ')}</Row> : null}
        {task.plan && editable ? (
          <Row label="Owner">
            <ChoiceField
              label="Owner"
              value={task.owner ?? ''}
              emptyLabel="Nobody yet"
              choices={team.map((m) => ({ value: m.id, label: m.name }))}
              disabled={busy}
              onCommit={(v) => void run(() => actions.assignTodo(task.id, v || null))}
            />
          </Row>
        ) : owner ? (
          <Row label="Owner">
            <Avatar src={owner.avatarUrl} name={owner.name} size="xs" />
            {owner.name}
          </Row>
        ) : null}
        {task.sharedFrom ? <Row label="From">{task.sharedFrom}</Row> : null}
      </dl>
      <Problem line={error} />
      {editable ? (
        <>
          <div className="cal-actions">
            {!task.done && task.due !== ctx.today ? (
              <Button
                type="button"
                size="sm"
                variant="primarySoft"
                disabled={busy}
                onClick={async () => {
                  if (await run(() => actions.moveTodo(task.id, ctx.today))) say('Moved to today.', 'success')
                }}
              >
                Do today
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={task.done ? 'secondary' : 'primary'}
              disabled={busy}
              onClick={async () => {
                const next = !task.done
                if (await run(() => actions.setTodoDone(task.id, next)) && next) say(`Done: ${task.title}`, 'success')
              }}
            >
              {task.done ? 'Reopen' : 'Mark done'}
            </Button>
            <Button type="button" size="sm" variant="dangerOutline" disabled={busy} onClick={() => setDeleting((v) => !v)}>
              Delete
            </Button>
          </div>
          {deleting ? (
            <div className="cal-confirm" role="group" aria-label="Delete this to-do">
              <p>Delete {task.title}? It leaves every list it is on.</p>
              <div className="cal-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={async () => {
                    const gone = await run(() => actions.deleteTodo(task.id))
                    setDeleting(false)
                    if (gone) {
                      say(`Deleted ${task.title}.`, 'neutral')
                      onClose()
                    }
                  }}
                >
                  Delete
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setDeleting(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : null}
          <p className="cal-as">Drag any to-do onto a time in Week or Day to give it a block.</p>
        </>
      ) : null}
    </>
  )
}

// ── A PLAN ──────────────────────────────────────────────────────────────────────────────────────

function PlanBody({ plan, data, ctx, actions, onSelect, say }: PanelProps & { plan: SuitePlan }) {
  const canEdit = !!ctx.canEdit
  const { error, busy, run } = useRun()
  const stats = planStats(plan, data, ctx.today)
  const kind = STAGE_KIND[plan.stage]
  const mine = hostSpaceId(plan) === ctx.ownSpaceId
  const editable = canEdit && mine && !isInvitePending(plan, ctx.ownSpaceId)
  const stage = settable(plan.stage)
  const dates = stats.items.map((i) => ctx.itemById.get(i.id)).filter((i): i is SuiteItem => !!i)
  const productionDate = plan.stage === 'production' ? dates.find((i) => i.entryId) : null
  const goLive = productionDate?.entryId && canEdit ? productionDoorHref(ctx.ownSpaceId, productionDate.entryId, plan.id) : null
  const eventHref = plan.stage === 'event' ? (dates.find((i) => i.eventHref)?.eventHref ?? null) : null
  return (
    <>
      <div className="cal-dkind">
        <span className="cal-pill" style={{ background: stats.health.bg, color: stats.health.fg }}>
          {stats.health.label}
        </span>
        <span className="cal-muted">Plan · {plan.targetLabel}</span>
      </div>
      {editable ? (
        <TextField
          className="cal-dtitle-in"
          heading
          label="Plan title"
          value={plan.title}
          disabled={busy}
          onCommit={(title) => void run(() => actions.editPlan(plan.id, { title }))}
        />
      ) : (
        <h3 className="cal-dtitle">{plan.title}</h3>
      )}
      {editable && (stage || plan.stage === 'event') ? (
        <SegmentedControl
          label="Stage"
          value={stage}
          onChange={async (next) => {
            if (await run(() => actions.setPlanStage(plan.id, planDoorStage(next)))) say(`Moved ${plan.title} to ${stageLabel(next)}.`, 'success')
          }}
          segments={STAGE_SEGMENTS}
        />
      ) : (
        <dl className="cal-dl">
          <Row label="Stage">
            <KindPill kind={kind}>{stageLabel(plan.stage)}</KindPill>
          </Row>
        </dl>
      )}
      {plan.stage === 'event' ? (
        <p className="cal-as">
          <KindPill kind="event">Published</KindPill> It is on your public calendar.
        </p>
      ) : null}
      <div className="cal-progress">
        <p className="cal-figure">
          {stats.todos.length ? `${stats.done} of ${stats.todos.length}` : 'No to-dos yet'}
          {stats.todos.length ? <span className="cal-muted"> to-dos done</span> : null}
        </p>
        {stats.todos.length ? <ProgressTrack value={stats.pct} label={`${stats.pct}% of to-dos done`} size="sm" /> : null}
      </div>
      <section aria-label="Dates">
        <p className="cal-caps">Dates</p>
        {stats.items.length === 0 ? (
          <p className="cal-serif">No date yet. Pencil one in from any day on the calendar.</p>
        ) : (
          <ul className="cal-plain">
            {stats.items.map((i) => (
              <li key={i.id}>
                <button type="button" className="cal-trow" onClick={() => onSelect({ kind: 'item', id: i.id })}>
                  <span className="cal-abar" style={{ background: KINDS[i.kind].dot }} aria-hidden />
                  <span className="cal-ttext">
                    <span className="cal-at">{dayLabel(i.date)}</span>
                    <span className="cal-as">
                      {i.startMin == null ? 'All day' : clockLabel(i.startMin)} · {KINDS[i.kind].word}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {editable ? (
        <div className="cal-notesf">
          <p className="cal-caps">Notes for the team</p>
          <TextField
            multiline
            label="Notes for the team"
            placeholder="Doors, setup, who brings what"
            value={plan.notes ?? ''}
            disabled={busy}
            onCommit={(notes) => void run(() => actions.editPlan(plan.id, { notes }))}
          />
        </div>
      ) : plan.notes ? (
        <p className="cal-notes">{plan.notes}</p>
      ) : null}
      <Problem line={error} />
      {goLive || eventHref ? (
        <div className="cal-actions">
          {goLive ? (
            <Link className={buttonClasses('primary', 'sm')} href={goLive}>
              Go live
            </Link>
          ) : null}
          {eventHref ? (
            <Link className={buttonClasses('primarySoft', 'sm')} href={eventHref}>
              Go to event
            </Link>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
