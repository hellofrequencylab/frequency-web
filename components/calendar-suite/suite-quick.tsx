'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { clockLabel, dayLabel } from '@/lib/calendar/planner/days'
import type { QuickKind } from '@/lib/calendar/planner/pencil-it-in'

// QUICK ADD (README 1.4): a small card where you clicked, with a title, the four things you can add,
// and a door to the full Pencil it in sheet. Enter adds, Esc closes. It sits inside the calendar's own
// box and is placed from the click, kept on screen; on a narrow console it is a sheet at the bottom.

const KINDS: { value: QuickKind; label: string }[] = [
  { value: 'pencil', label: 'Pencil' },
  { value: 'private', label: 'Private' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'todo', label: 'To-do' },
]
const CARD_W = 340
const CARD_H = 250

export function SuiteQuick({
  day,
  startMin,
  x,
  y,
  box,
  onAdd,
  onMore,
  onClose,
}: {
  day: string
  startMin: number | null
  /** The click, relative to the calendar's box. */
  x: number
  y: number
  /** The calendar box's size, to keep the card inside it. */
  box: { width: number; height: number }
  /** Returns a sentence when it failed, or null when it went through. */
  onAdd: (input: { kind: QuickKind; title: string; day: string; startMin: number | null }) => Promise<string | null>
  /** Opens the full sheet on this day. The typed title comes along. */
  onMore: (title: string) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<QuickKind>('pencil')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus()
  }, [])

  const left = Math.max(8, Math.min(x, box.width - CARD_W - 8))
  const top = Math.max(8, Math.min(y, box.height - CARD_H - 8))
  const when = `${dayLabel(day)}${startMin != null ? `, ${clockLabel(startMin)}` : ''}`

  const add = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    setError('')
    const failed = await onAdd({ kind, title: title.trim(), day, startMin })
    setBusy(false)
    if (failed) setError(failed)
  }

  return (
    <div className="cal-quick-wrap" data-cal-quick>
      <div className="cal-quick-scrim" onClick={onClose} aria-hidden />
      <form
        className="cal-quick fq-panel"
        role="dialog"
        aria-label="Quick add"
        style={{ '--qx': `${left}px`, '--qy': `${top}px` } as CSSProperties}
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <Input ref={input} value={title} maxLength={200} placeholder="What is it?" aria-label="What is it?" onChange={(e) => setTitle(e.target.value)} />
        <SegmentedControl label="Kind" size="sm" value={kind} onChange={setKind} segments={KINDS} />
        <p className="cal-serif">{when}</p>
        {error ? (
          <p className="cal-form-err" role="alert">
            {error}
          </p>
        ) : null}
        <div className="cal-quick-foot">
          <button type="button" className="cal-plink" onClick={() => onMore(title.trim())}>
            More dates and a playbook
          </button>
          <Button type="submit" size="sm" disabled={!title.trim()} loading={busy}>
            Add
          </Button>
        </div>
      </form>
    </div>
  )
}
