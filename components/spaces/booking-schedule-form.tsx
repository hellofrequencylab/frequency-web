'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { isError } from '@/lib/action-result'
import { setSpaceSchedule } from '@/lib/spaces/booking-actions'
import type { ScheduleSettings, SlotOverride } from '@/lib/spaces/booking'
import { IconButton } from '@/components/ui/icon-button'

// OWNER SCHEDULING RULES EDITOR (client, P2, ADR-605). Buffers before / after a booking, a minimum
// scheduling notice, a rolling booking window, and date-specific overrides (a day off, or one-off
// hours). Saved through the canEditProfile-gated setSpaceSchedule action, which the pure slot
// generator reads as additive options. The server re-validates + clamps, so this form is convenience.
//
// COPY: plain labels, no narrated feelings, no em/en dashes (CONTENT-VOICE §10). Tokens only.

const BUFFERS = [
  { value: 0, label: 'None' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
] as const

const NOTICES = [
  { value: 0, label: 'No minimum' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '1 day' },
  { value: 2880, label: '2 days' },
] as const

const WINDOWS = [7, 14, 30, 60, 90] as const

function minutesToHHMM(total: number | null): string {
  if (total == null) return '09:00'
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function hhmmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 24 || min < 0 || min > 59) return null
  const total = h * 60 + min
  return total >= 0 && total <= 1440 ? total : null
}

interface OverrideDraft {
  date: string
  isBlackout: boolean
  start: string
  end: string
}

function toOverrideDrafts(overrides: SlotOverride[]): OverrideDraft[] {
  return overrides.map((o) => ({
    date: o.date,
    isBlackout: o.isBlackout,
    start: minutesToHHMM(o.startMinute ?? 540),
    end: minutesToHHMM(o.endMinute ?? 1020),
  }))
}

export function BookingScheduleForm({
  spaceId,
  timezone,
  initialSettings,
  initialOverrides,
}: {
  spaceId: string
  /** The window timezone, stored on the schedule so overrides are interpreted in the same zone. */
  timezone: string
  initialSettings: ScheduleSettings
  initialOverrides: SlotOverride[]
}) {
  const router = useRouter()
  const [bufferBefore, setBufferBefore] = useState(initialSettings.bufferBeforeMinutes)
  const [bufferAfter, setBufferAfter] = useState(initialSettings.bufferAfterMinutes)
  const [minNotice, setMinNotice] = useState(initialSettings.minNoticeMinutes)
  const [windowDays, setWindowDays] = useState(initialSettings.bookingWindowDays)
  const [overrides, setOverrides] = useState<OverrideDraft[]>(() => toOverrideDrafts(initialOverrides))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  function updateOverride(index: number, patch: Partial<OverrideDraft>) {
    setOverrides((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    setSaved(false)
  }
  function addOverride() {
    const today = new Date().toISOString().slice(0, 10)
    setOverrides((prev) => [...prev, { date: today, isBlackout: true, start: '09:00', end: '17:00' }])
    setSaved(false)
  }
  function removeOverride(index: number) {
    setOverrides((prev) => prev.filter((_, i) => i !== index))
    setSaved(false)
  }

  function save() {
    setError(null)
    setSaved(false)

    const cleanOverrides: SlotOverride[] = []
    for (const o of overrides) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) {
        setError('Give every override a valid date.')
        return
      }
      if (o.isBlackout) {
        cleanOverrides.push({ date: o.date, isBlackout: true })
        continue
      }
      const startMinute = hhmmToMinutes(o.start)
      const endMinute = hhmmToMinutes(o.end)
      if (startMinute == null || endMinute == null || endMinute <= startMinute) {
        setError('Override hours must end after they start.')
        return
      }
      cleanOverrides.push({ date: o.date, isBlackout: false, startMinute, endMinute })
    }

    startSave(async () => {
      const result = await setSpaceSchedule(spaceId, {
        timezone,
        bufferBeforeMinutes: bufferBefore,
        bufferAfterMinutes: bufferAfter,
        minNoticeMinutes: minNotice,
        bookingWindowDays: windowDays,
        overrides: cleanOverrides,
      })
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
      className="space-y-6 rounded-card border border-border bg-surface p-5 lift-1 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending) save()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-meta font-medium text-muted">Buffer before</span>
          <Select
            value={bufferBefore}
            onChange={(e) => {
              setBufferBefore(Number(e.target.value))
              setSaved(false)
            }}
          >
            {BUFFERS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-meta font-medium text-muted">Buffer after</span>
          <Select
            value={bufferAfter}
            onChange={(e) => {
              setBufferAfter(Number(e.target.value))
              setSaved(false)
            }}
          >
            {BUFFERS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-meta font-medium text-muted">Minimum notice</span>
          <Select
            value={minNotice}
            onChange={(e) => {
              setMinNotice(Number(e.target.value))
              setSaved(false)
            }}
          >
            {NOTICES.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-meta font-medium text-muted">Booking window</span>
          <Select
            value={windowDays}
            onChange={(e) => {
              setWindowDays(Number(e.target.value))
              setSaved(false)
            }}
          >
            {WINDOWS.map((d) => (
              <option key={d} value={d}>
                {d} days out
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="space-y-3">
        {/* Heads the list of override rows. Not a <Label>: no single control under it. */}
        <p className={`${labelClasses} font-semibold`}>Date overrides</p>
        <p className="-mt-1 text-meta text-subtle">
          Take a day off, or set one-off hours for a specific date. These win over your weekly times.
        </p>
        {overrides.length === 0 && (
          <p className="rounded-card border border-dashed border-border px-3 py-4 text-center text-body-sm text-muted">
            No overrides. Your weekly times apply every week.
          </p>
        )}
        {overrides.map((o, i) => (
          <div
            key={i}
            className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface-elevated/40 p-3"
          >
            <label className="flex flex-col gap-1">
              <span className="text-meta font-medium text-muted">Date</span>
              <Input
                type="date"
                value={o.date}
                onChange={(e) => updateOverride(i, { date: e.target.value })}
                className="w-44"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-meta font-medium text-muted">Type</span>
              <Select
                value={o.isBlackout ? 'off' : 'hours'}
                onChange={(e) => updateOverride(i, { isBlackout: e.target.value === 'off' })}
                options={[
                  { value: 'off', label: 'Day off' },
                  { value: 'hours', label: 'Set hours' },
                ]}
              />
            </label>
            {!o.isBlackout && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-meta font-medium text-muted">Start</span>
                  <Input
                    type="time"
                    value={o.start}
                    onChange={(e) => updateOverride(i, { start: e.target.value })}
                    className="w-32"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-meta font-medium text-muted">End</span>
                  <Input
                    type="time"
                    value={o.end}
                    onChange={(e) => updateOverride(i, { end: e.target.value })}
                    className="w-32"
                  />
                </label>
              </>
            )}
            <IconButton
              variant="bordered"
              tone="danger"
              label="Remove this override"
              onClick={() => removeOverride(i)}
              className="mb-1"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        ))}
        <button
          type="button"
          onClick={addOverride}
          className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-primary-strong transition-colors hover:text-primary"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add an override
        </button>
      </div>

      {error && (
        <p className="rounded-card bg-danger-bg px-3 py-2 text-body-sm font-medium text-danger" role="alert">
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
              <Check className="h-4 w-4" aria-hidden /> Save scheduling rules
            </>
          )}
        </Button>
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-body-sm font-medium text-success" role="status">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
      </div>
    </form>
  )
}
