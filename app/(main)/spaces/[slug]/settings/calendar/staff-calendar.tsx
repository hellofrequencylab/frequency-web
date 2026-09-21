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
import { ENTRY_KINDS, ENTRY_STAGES, entryKind, entryStage, type CalendarLayerKey } from '@/lib/calendar/registry'
import { MAX_CANDIDATE_DATES, MAX_DESCRIPTION, type EntryInput } from '@/lib/calendar/entries'
import type { DayNote } from '@/lib/calendar/day-notes'
import type { SpacePlan } from '@/lib/calendar/plans'
import { isError } from '@/lib/action-result'
import { deleteCalendarEntry, findEntryClashes, loadStaffCalendarMonth, pickPencilDate, saveCalendarEntry } from './entry-actions'
import { createPenciledPlan, joinEntryToPlan, startPlanFromEntry } from './plan-actions'
import { PlanDrawer } from './plan-drawer'

// THE STAFF CALENDAR (ADR-1385, ADR-1388). The Space's public events and its private layer on one grid,
// with layer toggles, the vertical wheel paging months, and a drawer to add, edit and delete private
// entries: events on their way (moving through Pencil, Planning, Production, Cancelled), Unavailable time
// and Private entries. Writes go through ./entry-actions, which run on the caller's own session, so the
// table's RLS is the lock.

const LAYERS: CalendarLayerKey[] = ['events', 'pencil', 'private', 'unavailable', 'todos']

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
  } catch {
    return 'America/Los_Angeles'
  }
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
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<{ id: string | null; input: EntryInput } | null>(null)
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

  const set = <K extends keyof EntryInput>(key: K, value: EntryInput[K]) =>
    setDraft((d) => (d ? { ...d, input: { ...d.input, [key]: value } } : d))

  const done = () => {
    setDraft(null)
    setRefreshKey((k) => k + 1)
    router.refresh()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft) return
    setError(null)
    startTransition(async () => {
      if (!draft.id) {
        const res = await createPenciledPlan(slug, draft.input.title, draft.input.startDate, draft.input.timeZone)
        if (isError(res)) {
          setError(res.error)
        } else {
          setDraft({ id: res.data.entryId, input: { ...draft.input, planId: res.data.id } })
          setRefreshKey((k) => k + 1)
          router.refresh()
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

  const input = draft?.input
  const def = input ? entryKind(input.kind) : null
  const stage = def?.isPencil ? (entryStage(input?.stage) ?? ENTRY_STAGES[0]) : null
  const holding = stage?.stage === 'pencil'

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
    <div className="space-y-2">
      {canEdit && (
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
        wheelPaging
        layers={LAYERS}
        refreshKey={refreshKey}
        dayNotes={dayNotes}
        onPickDate={canEdit ? pick : undefined}
        onCreateAt={canEdit ? openNew : undefined}
        onEditEntry={
          canEdit
            ? (item) => {
                if (!item.entryId || !item.entryInput) return
                setError(null)
                setDraft({ id: item.entryId, input: item.entryInput })
              }
            : undefined
        }
      />

      <Dialog open={draft !== null} onClose={() => !pending && setDraft(null)} ariaLabelledBy="calendar-entry-title" className="max-w-lg">
        {input && !draft?.id ? (
          <form onSubmit={submit} className="space-y-4 rounded-card border border-border bg-surface p-6 lift-3">
            <h2 id="calendar-entry-title" className="text-lead font-bold text-text">Pencil a date</h2>
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
              <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving' : 'Pencil date'}</Button>
            </div>
          </form>
        ) : input && (
          <form onSubmit={submit} className="space-y-4 rounded-card border border-border bg-surface p-6 lift-3">
            <h2 id="calendar-entry-title" className="text-lead font-bold text-text">
              {draft?.id ? (def?.isPencil ? 'Edit event' : 'Edit entry') : def?.isPencil ? 'Pencil it in' : 'Add to calendar'}
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
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          input: {
                            ...d.input,
                            kind: next.kind,
                            allDay: next.defaults.allDay,
                            blocksTime: next.defaults.blocksTime,
                            showPublicly: next.canShowPublicly ? d.input.showPublicly : false,
                            status: next.defaultStatus,
                            stage: next.isPencil ? (d.input.stage ?? 'pencil') : null,
                            title: d.input.title === 'Unavailable' && next.kind !== 'unavailable' ? '' : d.input.title,
                          },
                        }
                      : d,
                  )
                }}
              />
            </div>

            {stage && !input.planId && (
              <div className="grid gap-1">
                <label htmlFor="entry-stage" className={labelClasses}>Stage</label>
                <Select
                  id="entry-stage"
                  value={stage.stage}
                  options={ENTRY_STAGES.map((st) => ({ value: st.stage, label: st.label }))}
                  onChange={(e) => set('stage', e.target.value)}
                  aria-describedby="entry-stage-hint"
                />
                <p id="entry-stage-hint" className="text-meta text-muted">{stage.hint}</p>
              </div>
            )}
            {stage && input.planId && (
              <div className="grid gap-1">
                <span className={labelClasses}>Stage</span>
                <p className="text-body-sm font-medium text-text">{stage.label}</p>
                <p className="text-meta text-muted">Move this Plan from Workflow so its dates stay in sync.</p>
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
                    onClick={() =>
                      startTransition(async () => {
                        const res = await startPlanFromEntry(slug, draft.id!, input.title || 'Untitled Plan')
                        if (isError(res)) setError(res.error)
                        else done()
                      })
                    }
                  >
                    Start a Plan
                  </Button>
                )}
                {draft?.id && input.planId && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const plan = plans.find((p) => p.id === input.planId) ?? null
                       if (onOpenPlan && plan) onOpenPlan(plan.id, draft?.id)
                       else setOpenPlan(plan)
                    }}
                  >
                    Open Plan
                  </Button>
                )}
                {draft?.id && input.planId && (
                  <Button asChild size="sm" variant="ghost">
                    <a href={`/events/new?space=${spaceId}&plan=${input.planId}&pencil=${draft.id}`}>
                      Make it a Production
                    </a>
                  </Button>
                )}
                {draft?.id && !input.planId && plans.length > 0 && (
                  <Select
                    aria-label="Join an existing Plan"
                    value=""
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
