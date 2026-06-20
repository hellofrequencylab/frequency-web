'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, fieldClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { setSpaceAvailability } from '@/lib/spaces/booking-actions'
import type { AvailabilityWindow } from '@/lib/spaces/booking'
import { cn } from '@/lib/utils'

// OWNER AVAILABILITY EDITOR (client). The Practitioner sets one or more weekly windows (weekday,
// start, end, slot length) plus the Space's timezone, saved through the canEditProfile-gated
// setSpaceAvailability action. Times are entered as HH:MM and converted to minutes-from-midnight on
// the wire. The server re-validates + normalizes, so this form is convenience, not the gate.
//
// COPY: plain labels, no narrated feelings, no em/en dashes (CONTENT-VOICE section 10).

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
] as const

const SLOT_LENGTHS = [15, 30, 45, 60, 90, 120] as const

/** A row in the editor (HH:MM strings for the time inputs; converted to minutes on save). */
interface WindowDraft {
  weekday: number
  start: string // "HH:MM"
  end: string // "HH:MM"
  slotMinutes: number
}

/** "HH:MM" to minutes from midnight, or null if malformed. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 24 || min < 0 || min > 59) return null
  const total = h * 60 + min
  return total >= 0 && total <= 1440 ? total : null
}

/** Minutes from midnight to "HH:MM" (24h). */
export function minutesToHHMM(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Map saved windows back to editable drafts (for the initial form state). */
function toDrafts(windows: AvailabilityWindow[]): WindowDraft[] {
  return windows.map((w) => ({
    weekday: w.weekday,
    start: minutesToHHMM(w.startMinute),
    end: minutesToHHMM(w.endMinute),
    slotMinutes: w.slotMinutes,
  }))
}

export function BookingAvailabilityForm({
  spaceId,
  slug,
  initialWindows,
  initialTimezone,
}: {
  spaceId: string
  slug: string
  initialWindows: AvailabilityWindow[]
  initialTimezone: string
}) {
  const router = useRouter()
  const [rows, setRows] = useState<WindowDraft[]>(() =>
    initialWindows.length > 0
      ? toDrafts(initialWindows)
      : [{ weekday: 1, start: '09:00', end: '17:00', slotMinutes: 30 }],
  )
  const [timezone, setTimezone] = useState(initialTimezone)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  function update(index: number, patch: Partial<WindowDraft>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    setSaved(false)
  }

  function addRow() {
    setRows((prev) => [...prev, { weekday: 1, start: '09:00', end: '17:00', slotMinutes: 30 }])
    setSaved(false)
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
    setSaved(false)
  }

  function save() {
    setError(null)
    setSaved(false)
    const tz = timezone.trim() || 'UTC'

    // Convert + client-validate. The server is authoritative, but a clear inline message helps.
    const windows: AvailabilityWindow[] = []
    for (const r of rows) {
      const startMinute = toMinutes(r.start)
      const endMinute = toMinutes(r.end)
      if (startMinute == null || endMinute == null) {
        setError('Use a 24-hour time like 09:00 for every start and end.')
        return
      }
      if (endMinute <= startMinute) {
        setError('Each window must end after it starts.')
        return
      }
      windows.push({ weekday: r.weekday, startMinute, endMinute, slotMinutes: r.slotMinutes, timezone: tz })
    }

    startSave(async () => {
      const result = await setSpaceAvailability(spaceId, windows)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form
      className="space-y-6 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending) save()
      }}
    >
      <div>
        <Label htmlFor="booking-timezone" className="font-semibold">
          Timezone
        </Label>
        <Input
          id="booking-timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="America/New_York"
          className="mt-1"
        />
        <p className="mt-1 text-xs text-subtle">
          An IANA name like America/New_York or Europe/London. Members see your times in this zone.
        </p>
      </div>

      <div className="space-y-3">
        <Label className="font-semibold">Weekly windows</Label>
        {rows.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
            No windows yet. Add one to start taking bookings.
          </p>
        )}
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-elevated/40 p-3"
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Day</span>
              <select
                value={r.weekday}
                onChange={(e) => update(i, { weekday: Number(e.target.value) })}
                className={cn(fieldClasses, 'w-36')}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Start</span>
              <input
                type="time"
                value={r.start}
                onChange={(e) => update(i, { start: e.target.value })}
                className={cn(fieldClasses, 'w-32')}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">End</span>
              <input
                type="time"
                value={r.end}
                onChange={(e) => update(i, { end: e.target.value })}
                className={cn(fieldClasses, 'w-32')}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Slot length</span>
              <select
                value={r.slotMinutes}
                onChange={(e) => update(i, { slotMinutes: Number(e.target.value) })}
                className={cn(fieldClasses, 'w-32')}
              >
                {SLOT_LENGTHS.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => removeRow(i)}
              aria-label="Remove this window"
              className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:text-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong transition-colors hover:text-primary"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add a window
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving
            </>
          ) : (
            <>
              <Check className="h-4 w-4" aria-hidden /> Save availability
            </>
          )}
        </Button>
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success" role="status">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
        <Button type="button" variant="ghost" onClick={() => router.push(`/spaces/${slug}/book`)} disabled={pending}>
          View booking page
        </Button>
      </div>
    </form>
  )
}
