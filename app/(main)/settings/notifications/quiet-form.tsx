'use client'

import { useState, useTransition } from 'react'
import { Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { saveQuietHours } from './quiet-actions'

// Quiet hours for team notices (EMAIL-091). Pushes and emails about tags and team threads wait
// until the morning; the bell in the app still shows everything at once.

const HOURS = Array.from({ length: 24 }, (_, h) => h)

function hourLabel(h: number): string {
  const suffix = h < 12 ? 'AM' : 'PM'
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve}:00 ${suffix}`
}

export function QuietHoursForm({ initial }: { initial: { start: number | null; end: number | null } }) {
  const [on, setOn] = useState(initial.start !== null && initial.end !== null)
  const [start, setStart] = useState(initial.start ?? 22)
  const [end, setEnd] = useState(initial.end ?? 7)
  const [status, setStatus] = useState('')
  const [pending, startTransition] = useTransition()

  const save = (nextOn: boolean) => {
    setStatus('')
    startTransition(async () => {
      const res = nextOn ? await saveQuietHours(start, end) : await saveQuietHours(null, null)
      if (isError(res)) setStatus(res.error)
      else {
        setOn(nextOn)
        setStatus(nextOn ? `Quiet from ${hourLabel(start)} to ${hourLabel(end)}.` : 'Quiet hours are off.')
      }
    })
  }

  return (
    <div className="mt-6 overflow-hidden rounded-card border border-border bg-surface lift-1">
      <div className="flex items-center gap-2 border-b border-border bg-surface-elevated px-4 py-3">
        <Moon className="h-4 w-4 text-muted" />
        <span className="text-body-sm font-semibold text-text">Quiet hours</span>
      </div>
      <div className="space-y-3 px-4 py-4">
        <p className="text-body-sm text-muted">
          Pushes and emails about tags and team threads wait until your quiet hours end. The bell in the app still shows
          everything right away.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-body-sm text-text">
          <label className="flex items-center gap-2">
            From
            <select
              className="rounded-control border border-border bg-surface px-2 py-1"
              value={start}
              disabled={pending}
              onChange={(e) => setStart(Number(e.target.value))}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            to
            <select
              className="rounded-control border border-border bg-surface px-2 py-1"
              value={end}
              disabled={pending}
              onChange={(e) => setEnd(Number(e.target.value))}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={pending || start === end} onClick={() => save(true)}>
            {on ? 'Save quiet hours' : 'Turn on quiet hours'}
          </Button>
          {on && (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => save(false)}>
              Turn off
            </Button>
          )}
        </div>
        <p role="status" aria-live="polite" className="text-meta text-muted">
          {status}
        </p>
      </div>
    </div>
  )
}
