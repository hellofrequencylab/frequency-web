'use client'

import { useCallback, useEffect, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Plus, X } from 'lucide-react'
import { EventCalendar, type CalendarEvent } from '@/components/events/event-calendar'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input, Textarea, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { StageTimeline } from '@/components/ui/stage-timeline'
import { ENTRY_KINDS, ENTRY_STAGES, entryKind, entryStage, type CalendarLayerKey, type EntryKindDef } from '@/lib/calendar/registry'
import { MAX_CANDIDATE_DATES, MAX_DESCRIPTION, type EntryInput } from '@/lib/calendar/entries'
import { PENCIL_REPEAT_CHOICES, pencilRepeatChoice, pencilRuleForChoice, withoutExceptionDate } from '@/lib/calendar/pencil-series'
import { describeRepeat, parseRepeat } from '@/lib/events/repeat-rule'
import { PUBLISH_STEP, productionDoorHref, stageTimeline } from '@/lib/calendar/stage-timeline'
import { shortDateLabel } from '@/lib/calendar/short-date'
import { browserZone } from '@/lib/calendar/browser-zone'
import type { DayNote } from '@/lib/calendar/day-notes'
import type { SpacePlan } from '@/lib/calendar/plans'
import { isError } from '@/lib/action-result'
import { deleteCalendarEntry, findEntryClashes, loadStaffCalendarMonth, pickPencilDate, saveCalendarEntry, skipPencilDate } from './entry-actions'
import { createPenciledPlan, joinEntryToPlan, startPlanFromEntry } from './plan-actions'
import { PlanDrawer } from './plan-drawer'

// THE STAFF CALENDAR (ADR-1385, ADR-1388). The Space's public events and its private layer on one grid,
// with layer toggles, the vertical wheel paging months where the host asks for it (the Calendar console,
// PROG-CAL12; the page pages by its buttons only), and a drawer to add, edit and delete private
// entries: events on their way (moving through Pencil, Planning, Production, Cancelled), Unavailable time
// and Private entries. Writes go through ./entry-actions, which run on the caller's own session, so the
// table's RLS is the lock.

const LAYERS: CalendarLayerKey[] = ['events', 'pencil', 'private', 'unavailable', 'todos']

/** The drawer's working copy of one entry. `saved` is the input as last written, so the Publish
 *  step can tell whether typed fields would be lost by leaving; `optionGroup` says the date still
 *  has candidate siblings (ADR-1388 §3), which the timeline refuses to move past Pencil. */
interface Draft {
  id: string | null
  input: EntryInput
  optionGroup?: string | null
  saved?: string
  /** The day this drawer was opened from when the entry repeats (PROG-CAL5): what "Skip this date"
   *  skips. Null when opened from the master or a one-off. */
  occurrenceDate?: string | null
}

function blankInput(kind: string, dayKey: string): EntryInput {
  const def = entryKind(kind) ?? ENTRY_KINDS[0]
  return {
    kind: def.kind,
    title: def.kind === 'unavailable' ? 'Unavailable' : '',
    holdExpiresOn: '',
    candidateDates: [],
    stage: def.isPencil ? 'pencil' : null,
    description: '',
    notes: '',
    location: '',
    allDay: def.defaults.allDay,
    startDate: dayKey,
    endDate: dayKey,
    startTime: '09:00',
    endTime: '10:00',
    timeZone: browserZone(),
    status: def.defaultStatus,
    blocksTime: def.defaults.blocksTime,
    showPublicly: false,
    planId: null,
    repeat: '',
    exceptionDates: [],
  }
}

/** The form re-defaulted for a Type change, in one place for both forms (LIVE-467). A kind that is
 *  not an event on its way never belongs to a Plan, so switching to Unavailable or Private drops the
 *  Plan link; before, the link survived the switch and a stray Plan sat on Workflow with no date. */
function withKind(input: EntryInput, next: EntryKindDef): EntryInput {
  return {
    ...input,
    kind: next.kind,
    allDay: next.defaults.allDay,
    blocksTime: next.defaults.blocksTime,
    showPublicly: next.canShowPublicly ? input.showPublicly : false,
    status: next.defaultStatus,
    stage: next.isPencil ? (input.stage ?? 'pencil') : null,
    planId: next.isPencil ? input.planId : null,
    title:
      input.title === 'Unavailable' && next.kind !== 'unavailable'
        ? ''
        : input.title === '' && next.kind === 'unavailable'
          ? 'Unavailable'
          : input.title,
  }
}

export function StaffCalendar({
  slug,
  spaceId,
  events,
  initialYear,
  initialMonth1,
  canEdit,
  dayNotes,
  plans = [],
  onOpenPlan,
  externalRefreshKey = 0,
  wheelPaging = false,
  month,
  onMonthChange,
  newEntryRequest = 0,
  pencilButton = true,
  fill = false,
  hostChrome = false,
}: {
  slug: string
  spaceId: string
  events: CalendarEvent[]
  initialYear: number
  initialMonth1: number
  /** False for a platform staff preview: the calendar is read-only. */
  canEdit: boolean
  dayNotes?: DayNote[]
  plans?: SpacePlan[]
  onOpenPlan?: (planId: string, entryId?: string | null) => void
  /** Bumped by a write that happened OUTSIDE this drawer (Vera's accepted proposal, PROG-CAL10),
   *  so a browsed month drops its fetched cache the same way a drawer save does. */
  externalRefreshKey?: number
  /** Let the vertical wheel and a sideways swipe page months (PROG-CAL12). The page calendar leaves
   *  this off, so it is navigated by its buttons only; the console turns it on. */
  wheelPaging?: boolean
  /** The host's month, when the host owns it (the console header and its agenda read the same one). */
  month?: { year: number; month1: number }
  onMonthChange?: (next: { year: number; month1: number }) => void
  /** Bump to open a blank pencil on today, from a control outside this component (the console's
   *  "Pencil it in" and its N key). Read at render, the same way `externalRefreshKey` is. */
  newEntryRequest?: number
  /** Render the "Pencil it in" button above the grid. Off when the host draws its own. */
  pencilButton?: boolean
  /** Stretch the grid to the host's height (the console). */
  fill?: boolean
  /** The host draws the month label, the paging cluster and the grid / list switcher, so the grid
   *  draws none of them (the console header owns all three). Passed straight through. */
  hostChrome?: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [openPlan, setOpenPlan] = useState<SpacePlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pending, startTransition] = useTransition()

  const loadMonth = useCallback((y: number, m: number) => loadStaffCalendarMonth(slug, y, m), [slug])
  const openNew = (dayKey: string) => {
    setError(null)
    setDraft({ id: null, input: blankInput('pencil', dayKey) })
  }
  const today = () => new Date().toLocaleDateString('en-CA')
  // An outside "Pencil it in" (the console header, its N key) lands here as a bumped counter, so the
  // drawer opens from the same `blankInput` the button above the grid uses. Render-time compare, no
  // effect cascade: the same shape EventCalendar uses for its `refreshKey`.
  const [seenEntryRequest, setSeenEntryRequest] = useState(newEntryRequest)
  if (seenEntryRequest !== newEntryRequest) {
    setSeenEntryRequest(newEntryRequest)
    if (canEdit) {
      setError(null)
      setDraft({ id: null, input: blankInput('pencil', today()) })
    }
  }

  const set = <K extends keyof EntryInput>(key: K, value: EntryInput[K]) =>
    setDraft((d) => (d ? { ...d, input: { ...d.input, [key]: value } } : d))

  /**
   * A write landed. Close the drawer and bump `refreshKey`, which the month grid re-fetches on.
   *
   * 🔴 NO `router.refresh()` HERE, OR ANYWHERE IN THIS FILE (LIVE-462). Every write action this
   * drawer calls ends in `revalidate(slug)` — `revalidatePath` on both calendar routes — and in a
   * Server Function that "updates the UI immediately (if viewing the affected path)"
   * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md). The fresh
   * tree, `plans` included, arrives in the action's own round trip. A client refresh on top of it
   * was a SECOND full server render of a 16-month operator horizon after every save.
   *
   * It was worse than wasteful. Every control in this drawer is `disabled={pending}`, `pending` is
   * `useTransition`'s, and the refresh ran INSIDE `startTransition` — so a successful save froze
   * the whole form until that second render came back. On a cold deployment that is seconds of a
   * form reading "Saving" over a row already in the database, with Delete sitting beside Save.
   *
   * Found by operator-calendar.spec.ts the first run it was ever allowed to take: three tests
   * failing after "Pencil date" with "element is not enabled" then "element was detached from the
   * DOM", while the space_plans rows they created sat in the database timestamped to the click.
   */
  const done = () => {
    setDraft(null)
    setRefreshKey((k) => k + 1)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft) return
    setError(null)
    startTransition(async () => {
      if (!draft.id && draft.input.kind !== 'pencil') {
        // Unavailable time and a Private entry are not events on their way, so they get no Plan
        // (LIVE-467): before, every "+" and "Pencil it in" made a Plan whatever the Type became.
        const res = await saveCalendarEntry(slug, null, draft.input)
        if (isError(res)) setError(res.error)
        else done()
        return
      }
      if (!draft.id) {
        const res = await createPenciledPlan(slug, draft.input.title, draft.input.startDate, draft.input.timeZone)
        if (isError(res)) {
          setError(res.error)
        } else {
          const input = { ...draft.input, planId: res.data.id }
          setDraft({ id: res.data.entryId, input, saved: JSON.stringify(input) })
          // Keeps the drawer OPEN on the saved row: the Pencil now has a Plan, so "Open Plan"
          // appears. The month grid re-fetches on `refreshKey`; the rest of the page was already
          // refreshed by the action's own revalidate(slug) — see the note on done().
          setRefreshKey((k) => k + 1)
        }
        return
      }
      const res = await saveCalendarEntry(slug, draft.id, draft.input)
      if (isError(res)) setError(res.error)
      else done()
    })
  }

  const remove = () => {
    if (!draft?.id) return
    const id = draft.id
    setError(null)
    startTransition(async () => {
      const res = await deleteCalendarEntry(slug, id)
      if (isError(res)) setError(res.error)
      else done()
    })
  }

  // SKIP THIS DATE (PROG-CAL5). Its own action, like Delete, and it closes the drawer the same way:
  // the skip is on the row the moment it lands, and a Save from a form that still held the old list
  // would write the skip straight back out.
  const skip = () => {
    if (!draft?.id || !draft.occurrenceDate) return
    const id = draft.id
    const day = draft.occurrenceDate
    setError(null)
    startTransition(async () => {
      const res = await skipPencilDate(slug, id, day)
      if (isError(res)) setError(res.error)
      else done()
    })
  }

  const input = draft?.input
  const def = input ? entryKind(input.kind) : null
  const stage = def?.isPencil ? (entryStage(input?.stage) ?? ENTRY_STAGES[0]) : null
  const holding = stage?.stage === 'pencil'
  // REPEATS (PROG-CAL5): the stored rule as the menu names it, the rule itself for the sentence, and
  // the skips as the form carries them (round-tripped on Save so an ordinary edit never wipes one).
  const repeatChoice = pencilRepeatChoice(input?.repeat)
  const repeatRule = parseRepeat(input?.repeat)
  const skippedDates = input?.exceptionDates ?? []

  // THE STAGE TIMELINE (ADR-1504). Four steps in place of the old Stage select. Steps one to three
  // write `stage` into the SAME form state the select wrote, so every other field the person has
  // typed survives and the change persists on Save exactly as before: nothing auto-saves on click.
  // The fourth step, Publish, is the door to the event Spark ("Make it a Production"), not a stage.
  const timeline = stage ? stageTimeline({ stage: stage.stage, oneOfSeveral: !!draft?.optionGroup }) : null
  const step = (key: string) => {
    if (key === PUBLISH_STEP) {
      publish()
      return
    }
    set('stage', key)
  }
  // Publish saves first when the drawer holds unsaved edits, then leaves for the Spark, so a person
  // never loses typed fields by clicking it. The Spark prefills from the saved row (`pencil=`), and
  // from its Plan when it has one.
  const publish = () => {
    if (!draft?.id) return
    const id = draft.id
    const href = productionDoorHref(spaceId, id, draft.input.planId)
    const dirty = draft.saved !== JSON.stringify(draft.input)
    setError(null)
    startTransition(async () => {
      if (dirty) {
        const res = await saveCalendarEntry(slug, id, draft.input)
        if (isError(res)) {
          setError(res.error)
          return
        }
      }
      router.push(href)
    })
  }

  // CLASH WARNINGS (ADR-1386): what this entry would overlap. A warning, never a block.
  const [clashes, setClashes] = useState<string[]>([])
  const clashKey = draft
    ? JSON.stringify([draft.id, draft.input.kind, draft.input.stage, draft.input.allDay, draft.input.startDate, draft.input.endDate, draft.input.startTime, draft.input.endTime])
    : null
  useEffect(() => {
    if (!clashKey || !draft) return
    let live = true
    const t = setTimeout(() => {
      findEntryClashes(slug, draft.id, draft.input)
        .then((c) => live && setClashes(c))
        .catch(() => live && setClashes([]))
    }, 400)
    return () => {
      live = false
      clearTimeout(t)
    }
    // Only the date-shaped fields move the check; `draft` is read at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clashKey, slug])
  const shownClashes = clashKey ? clashes : []

  const pick = (item: CalendarEvent) => {
    if (!item.entryId) return
    const id = item.entryId
    startTransition(async () => {
      const res = await pickPencilDate(slug, id)
      if (isError(res)) setError(res.error)
      else done()
    })
  }

  return (
    <div className={fill ? 'flex h-full min-h-0 flex-col gap-2' : 'space-y-2'}>
      {canEdit && pencilButton && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => openNew(today())}>
            <Plus className="h-4 w-4" aria-hidden /> Pencil it in
          </Button>
        </div>
      )}
      <EventCalendar
        events={events}
        initialYear={initialYear}
        initialMonth1={initialMonth1}
        loadMonth={loadMonth}
        wheelPaging={wheelPaging}
        swipePaging={wheelPaging}
        month={month}
        onMonthChange={onMonthChange}
        fill={fill}
        hostChrome={hostChrome}
        layers={LAYERS}
        refreshKey={refreshKey + externalRefreshKey}
        dayNotes={dayNotes}
        onPickDate={canEdit ? pick : undefined}
        onCreateAt={canEdit ? openNew : undefined}
        onEditEntry={
          canEdit
            ? (item) => {
                if (!item.entryId || !item.entryInput) return
                setError(null)
                setDraft({
                  id: item.entryId,
                  input: item.entryInput,
                  optionGroup: item.optionGroup ?? null,
                  saved: JSON.stringify(item.entryInput),
                  occurrenceDate: item.occurrenceDate ?? null,
                })
              }
            : undefined
        }
      />

      <Dialog open={draft !== null} onClose={() => !pending && setDraft(null)} ariaLabelledBy="calendar-entry-title" className="max-w-lg">
        {input && !draft?.id ? (
          <form onSubmit={submit} className="space-y-4 rounded-card border border-border bg-surface p-6 lift-3">
            <h2 id="calendar-entry-title" className="text-lead font-bold text-text">{def?.isPencil ? 'Pencil a date' : 'Add to calendar'}</h2>
            {/* THE TYPE IS OFFERED HERE, NOT ONLY AFTER THE SAVE (LIVE-467). The short form used to
                assume an event on its way, so Unavailable time could only be made by pencilling a
                Plan first and switching the Type afterwards, and the Plan stayed behind. */}
            <div className="grid gap-1">
              <label htmlFor="entry-kind" className={labelClasses}>Type</label>
              <Select
                id="entry-kind"
                value={input.kind}
                options={ENTRY_KINDS.map((k) => ({ value: k.kind, label: k.label }))}
                onChange={(e) => {
                  const next = entryKind(e.target.value)
                  if (!next) return
                  setDraft((d) => (d ? { ...d, input: withKind(d.input, next) } : d))
                }}
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="entry-title" className={labelClasses}>Title</label>
              <Input id="entry-title" required maxLength={200} value={input.title} onChange={(e) => set('title', e.target.value)} autoFocus />
            </div>
            <div className="grid gap-1">
              <label htmlFor="entry-start-date" className={labelClasses}>Date</label>
              <Input
                id="entry-start-date"
                type="date"
                required
                value={input.startDate}
                onChange={(e) => setDraft((d) => d ? { ...d, input: { ...d.input, startDate: e.target.value, endDate: e.target.value } } : d)}
              />
            </div>
            {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setDraft(null)} disabled={pending}>Cancel</Button>
              <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving' : def?.isPencil ? 'Pencil date' : 'Add it'}</Button>
            </div>
          </form>
        ) : input && (
          <form onSubmit={submit} className="space-y-4 rounded-card border border-border bg-surface p-6 lift-3">
            {/* Only a SAVED entry reaches this form (a new one takes the short form above), so the
                heading is always an edit. */}
            <h2 id="calendar-entry-title" className="text-lead font-bold text-text">
              {def?.isPencil ? 'Edit event' : 'Edit date'}
            </h2>

            <div className="grid gap-1">
              <label htmlFor="entry-kind" className={labelClasses}>Type</label>
              <Select
                id="entry-kind"
                value={input.kind}
                options={ENTRY_KINDS.map((k) => ({ value: k.kind, label: k.label }))}
                onChange={(e) => {
                  const next = entryKind(e.target.value)
                  if (!next) return
                  setDraft((d) => (d ? { ...d, input: withKind(d.input, next) } : d))
                }}
              />
            </div>

            {stage && timeline && (
              <div className="grid gap-1">
                <span className={labelClasses}>Stage</span>
                <StageTimeline
                  label="Stage"
                  steps={timeline.steps}
                  onStep={step}
                  hint={timeline.hint}
                  hintId="entry-stage-hint"
                  reasons={timeline.reasons}
                  pending={pending}
                />
                {input.planId && (
                  <p className="text-meta text-muted">
                    This date belongs to a Plan. Moving it here moves the Plan and every date on it.
                  </p>
                )}
                {/* Cancelled is an exit, not a step: a pipeline and its exit never share a control (ADR-1504).
                    ON A PLAN-LINKED DATE THE EXIT IS THE PLAN'S (LIVE-467). The stage model has one
                    lifecycle write, and the Plan leads it (transitionPlanStage): Cancelled here
                    archives the Plan and marks every date on it Cancelled on Save. So the button says
                    that, rather than "this date" over a change that reaches all of them. */}
                <div>
                  {timeline.cancelled ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => set('stage', 'pencil')} disabled={pending}>
                      Bring it back
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => set('stage', 'cancelled')}
                      disabled={pending}
                      aria-describedby={input.planId ? 'entry-cancel-plan-hint' : undefined}
                    >
                      {input.planId ? 'Cancel the Plan' : 'Cancel this date'}
                    </Button>
                  )}
                  {input.planId && !timeline.cancelled && (
                    <p id="entry-cancel-plan-hint" className="mt-1 text-meta text-muted">
                      Marks the Plan Cancelled with every date on it, and takes it off Workflow when you save. Bring it back returns them all to Pencil.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-1">
              <label htmlFor="entry-title" className={labelClasses}>Title</label>
              <Input id="entry-title" required maxLength={200} value={input.title} onChange={(e) => set('title', e.target.value)} />
            </div>

            <label className="flex items-center justify-between gap-3 text-body-sm text-text">
              <span id="entry-all-day">All day</span>
              <Switch checked={input.allDay} onCheckedChange={(v) => set('allDay', v)} aria-labelledby="entry-all-day" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <label htmlFor="entry-start-date" className={labelClasses}>Starts</label>
                <Input
                  id="entry-start-date"
                  type="date"
                  required
                  value={input.startDate}
                  onChange={(e) =>
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            input: {
                              ...d.input,
                              startDate: e.target.value,
                              endDate: d.input.endDate < e.target.value ? e.target.value : d.input.endDate,
                            },
                          }
                        : d,
                    )
                  }
                />
                {!input.allDay && (
                  <Input type="time" required aria-label="Start time" value={input.startTime ?? ''} onChange={(e) => set('startTime', e.target.value)} />
                )}
              </div>
              <div className="grid gap-1">
                <label htmlFor="entry-end-date" className={labelClasses}>Ends</label>
                <Input
                  id="entry-end-date"
                  type="date"
                  required
                  min={input.startDate}
                  value={input.endDate}
                  onChange={(e) => set('endDate', e.target.value)}
                />
                {!input.allDay && (
                  <Input type="time" required aria-label="End time" value={input.endTime ?? ''} onChange={(e) => set('endTime', e.target.value)} />
                )}
              </div>
            </div>
            <p className="text-meta text-muted">Times are in {input.timeZone.replace(/_/g, ' ')}.</p>

            {def?.isPencil && (
              <div className="grid gap-1">
                <label htmlFor="entry-repeat" className={labelClasses}>Repeats</label>
                <Select
                  id="entry-repeat"
                  value={repeatChoice}
                  options={[
                    ...PENCIL_REPEAT_CHOICES.map((c) => ({ value: c.value, label: c.label })),
                    // A rule the menu does not offer stays exactly as stored rather than being
                    // dropped by the first edit that touches the drawer.
                    ...(repeatChoice === 'custom' ? [{ value: 'custom', label: 'Custom' }] : []),
                  ]}
                  onChange={(e) => {
                    if (e.target.value === 'custom') return
                    set('repeat', pencilRuleForChoice(e.target.value) ?? '')
                  }}
                  aria-describedby="entry-repeat-hint"
                />
                <p id="entry-repeat-hint" className="text-meta text-muted">
                  {repeatRule
                    ? `${describeRepeat(repeatRule, `${input.startDate}T00:00:00.000Z`)}, from the first date. Skipped dates stay skipped until you put them back.`
                    : 'Pick a cadence to pencil this in on a rhythm.'}
                </p>
                {draft?.id && draft.occurrenceDate && repeatRule && !skippedDates.includes(draft.occurrenceDate) && (
                  <div>
                    <Button type="button" variant="secondary" size="sm" onClick={skip} disabled={pending}>
                      Skip this date ({shortDateLabel(draft.occurrenceDate)})
                    </Button>
                  </div>
                )}
                {skippedDates.length > 0 && (
                  <ul className="grid gap-1" aria-label="Skipped dates">
                    {skippedDates.map((d) => (
                      <li key={d} className="flex items-center justify-between gap-2 text-body-sm text-text">
                        <span>Skipped {shortDateLabel(d)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => set('exceptionDates', withoutExceptionDate(skippedDates, d))}
                          disabled={pending}
                        >
                          Put it back
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {holding && (
              <div className="grid gap-1">
                <span className={labelClasses}>{draft?.id ? 'Add possible dates (optional)' : 'Other possible dates (optional)'}</span>
                {(input.candidateDates ?? []).map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="date"
                      aria-label={`Other date ${i + 1}`}
                      value={d}
                      onChange={(e) =>
                        set(
                          'candidateDates',
                          (input.candidateDates ?? []).map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                    />
                    <IconButton
                      label={`Remove other date ${i + 1}`}
                      onClick={() => set('candidateDates', (input.candidateDates ?? []).filter((_, j) => j !== i))}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </IconButton>
                  </div>
                ))}
                {(input.candidateDates?.length ?? 0) + 1 < MAX_CANDIDATE_DATES && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => set('candidateDates', [...(input.candidateDates ?? []), ''])}
                  >
                    <Plus className="h-4 w-4" aria-hidden /> Add another date
                  </Button>
                )}
                <p className="text-meta text-muted">Each date is penciled in. Keep one when you decide.</p>
              </div>
            )}

            {holding && (
              <div className="grid gap-1">
                <label htmlFor="entry-lapse" className={labelClasses}>Lapses on (optional)</label>
                <Input id="entry-lapse" type="date" value={input.holdExpiresOn ?? ''} onChange={(e) => set('holdExpiresOn', e.target.value)} />
              </div>
            )}

            {shownClashes.length > 0 && (
              <div role="status" className="rounded-control bg-warning-bg px-3 py-2 text-body-sm text-warning">
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-4 w-4" aria-hidden /> This overlaps
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {shownClashes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-1">
              <label htmlFor="entry-location" className={labelClasses}>Location (optional)</label>
              <Input id="entry-location" maxLength={300} value={input.location ?? ''} onChange={(e) => set('location', e.target.value)} />
            </div>

            {def?.isPencil && (
              <div className="grid gap-1">
                <label htmlFor="entry-description" className={labelClasses}>Description (optional)</label>
                <Textarea
                  id="entry-description"
                  rows={4}
                  maxLength={MAX_DESCRIPTION}
                  value={input.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                  aria-describedby="entry-description-hint"
                />
                <p id="entry-description-hint" className="text-meta text-muted">
                  What people will read about it. This becomes the event description when you publish it.
                </p>
              </div>
            )}

            <div className="grid gap-1">
              <label htmlFor="entry-notes" className={labelClasses}>Team notes (optional)</label>
              <Textarea
                id="entry-notes"
                rows={3}
                maxLength={4000}
                value={input.notes ?? ''}
                onChange={(e) => set('notes', e.target.value)}
                aria-describedby="entry-notes-hint"
              />
              <p id="entry-notes-hint" className="text-meta text-muted">Only your team sees these.</p>
            </div>

            {!def?.isPencil && (
              <div className="grid gap-1">
                <label htmlFor="entry-status" className={labelClasses}>Status</label>
                <Select
                  id="entry-status"
                  value={input.status ?? 'confirmed'}
                  options={[
                    { value: 'confirmed', label: 'Confirmed' },
                    { value: 'tentative', label: 'Tentative' },
                    { value: 'cancelled', label: 'Cancelled' },
                  ]}
                  onChange={(e) => set('status', e.target.value)}
                />
              </div>
            )}

            <label className="flex items-start justify-between gap-3 text-body-sm text-text">
              <span>
                <span id="entry-blocks" className="block font-medium">Block bookings</span>
                <span className="block text-meta text-muted">Members cannot book appointments during this time.</span>
              </span>
              <Switch checked={input.blocksTime} onCheckedChange={(v) => set('blocksTime', v)} aria-labelledby="entry-blocks" />
            </label>

            {def?.canShowPublicly && (
              <label className="flex items-start justify-between gap-3 text-body-sm text-text">
                <span>
                  <span id="entry-public" className="block font-medium">Show on the public calendar</span>
                  <span className="block text-meta text-muted">Visitors see this time as Unavailable. The title and notes stay private.</span>
                </span>
                <Switch checked={input.showPublicly} onCheckedChange={(v) => set('showPublicly', v)} aria-labelledby="entry-public" />
              </label>
            )}

            {error && (
              <p role="alert" className="text-body-sm text-danger">
                {error}
              </p>
            )}

            {canEdit && def?.isPencil && (
              <div className="flex flex-wrap gap-2">
                {draft?.id && !input.planId && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await startPlanFromEntry(slug, draft.id!, input.title || 'Untitled Plan')
                        if (isError(res)) setError(res.error)
                        else done()
                      })
                    }
                  >
                    Start a plan
                  </Button>
                )}
                {draft?.id && input.planId && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      // 🔴 `onOpenPlan` TAKES AN ID, SO IT MUST NOT BE GATED ON FINDING THE OBJECT
                      // (LIVE-462). `plans` is a server prop, and the Plan this button is for was
                      // created seconds ago by the save directly above — so on the one path that
                      // matters most, opening the Plan you just made, `plans` has not caught up and
                      // `find` returns undefined. The old guard then fell through to
                      // `setOpenPlan(null)`, and the button DID NOTHING. No error, no drawer, no
                      // log: the exact swallowed no-op AGENTS.md calls an invisible regression.
                      //
                      // The consumer (`selectPlan` in calendar-workspace.tsx) only ever uses the
                      // id — it sets state and writes `?plan=` — so the id is all this needs.
                      // `input.planId` is non-null here by the render guard above.
                      if (onOpenPlan) {
                        onOpenPlan(input.planId!, draft?.id)
                        return
                      }
                      // The local fallback genuinely needs the object, and tolerates not having it.
                      setOpenPlan(plans.find((p) => p.id === input.planId) ?? null)
                    }}
                  >
                    Open Plan
                  </Button>
                )}
                {draft?.id && !input.planId && plans.length > 0 && (
                  <Select
                    aria-label="Join an existing Plan"
                    value=""
                    disabled={pending}
                    options={[{ value: '', label: 'Join a Plan' }, ...plans.map((p) => ({ value: p.id, label: p.title }))]}
                    onChange={(e) => {
                      const planId = e.target.value
                      if (!planId || !draft.id) return
                      startTransition(async () => {
                        const res = await joinEntryToPlan(slug, draft.id!, planId)
                        if (isError(res)) setError(res.error)
                        else done()
                      })
                    }}
                  />
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              {draft?.id ? (
                <Button type="button" variant="dangerOutline" size="sm" onClick={remove} disabled={pending}>
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setDraft(null)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? 'Saving' : 'Save'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Dialog>
      {!onOpenPlan && (
        <PlanDrawer
          slug={slug}
          plan={openPlan}
          entryId={draft?.id}
          open={openPlan !== null}
          onClose={() => setOpenPlan(null)}
        />
      )}
    </div>
  )
}
