'use client'

import { useCallback, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { EventCalendar, type CalendarEvent } from '@/components/events/event-calendar'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Textarea, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ENTRY_KINDS, entryKind, type CalendarLayerKey } from '@/lib/calendar/registry'
import type { EntryInput } from '@/lib/calendar/entries'
import { isError } from '@/lib/action-result'
import { deleteCalendarEntry, loadStaffCalendarMonth, saveCalendarEntry } from './entry-actions'

// THE STAFF CALENDAR (ADR-1385). The Space's public events and its private layer on one grid, with
// layer toggles, the vertical wheel paging months, and a drawer to add, edit and delete private
// entries (Unavailable time and Private entries). Writes go through ./entry-actions, which run on the
// caller's own session, so the table's RLS is the lock.

const LAYERS: CalendarLayerKey[] = ['events', 'private', 'unavailable']

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
    notes: '',
    location: '',
    allDay: def.defaults.allDay,
    startDate: dayKey,
    endDate: dayKey,
    startTime: '09:00',
    endTime: '10:00',
    timeZone: browserZone(),
    status: 'confirmed',
    blocksTime: def.defaults.blocksTime,
    showPublicly: false,
  }
}

export function StaffCalendar({
  slug,
  events,
  initialYear,
  initialMonth1,
  canEdit,
}: {
  slug: string
  events: CalendarEvent[]
  initialYear: number
  initialMonth1: number
  /** False for a platform staff preview: the calendar is read-only. */
  canEdit: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<{ id: string | null; input: EntryInput } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pending, startTransition] = useTransition()

  const loadMonth = useCallback((y: number, m: number) => loadStaffCalendarMonth(slug, y, m), [slug])
  const openNew = (dayKey: string) => {
    setError(null)
    setDraft({ id: null, input: blankInput('unavailable', dayKey) })
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

  return (
    <div className="space-y-2">
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => openNew(today())}>
            <Plus className="h-4 w-4" aria-hidden /> Add to calendar
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
        {input && (
          <form onSubmit={submit} className="space-y-4 rounded-card border border-border bg-surface p-6 lift-3">
            <h2 id="calendar-entry-title" className="text-lead font-bold text-text">
              {draft?.id ? 'Edit entry' : 'Add to calendar'}
            </h2>

            <div className="grid gap-1">
              <label htmlFor="entry-kind" className={labelClasses}>Type</label>
              <Select
                id="entry-kind"
                value={input.kind}
                disabled={!!draft?.id}
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
                            title: d.input.title === 'Unavailable' && next.kind !== 'unavailable' ? '' : d.input.title,
                          },
                        }
                      : d,
                  )
                }}
              />
            </div>

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

            <div className="grid gap-1">
              <label htmlFor="entry-location" className={labelClasses}>Location (optional)</label>
              <Input id="entry-location" maxLength={300} value={input.location ?? ''} onChange={(e) => set('location', e.target.value)} />
            </div>

            <div className="grid gap-1">
              <label htmlFor="entry-notes" className={labelClasses}>Notes (optional)</label>
              <Textarea id="entry-notes" rows={3} maxLength={4000} value={input.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
            </div>

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
    </div>
  )
}
