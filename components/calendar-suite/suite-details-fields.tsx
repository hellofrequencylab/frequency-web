'use client'

import { useCallback, useOptimistic, useState, useTransition, type ReactNode } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import type { DetailsChoice } from '@/lib/calendar/planner/details'

// THE SMALL CONTROLS OF THE DETAILS PANEL. Each is the kit's own field wearing the panel's look. A
// control keeps what the person typed until the record it shows changes: the parent passes `value`,
// the control is keyed on it, and a save that lands (or a record that moves) remounts it with the
// truth. Nothing here writes; `onCommit` hands the new value up.

type Done = { error: string } | { data?: unknown }

/** One field of the panel: the caption, then the control. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cal-drow">
      <dt className="cal-caps">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** A text field that saves when the person leaves it or presses Enter, and puts the old text back on Escape. */
export function TextField(props: TextFieldProps) {
  return <TextFieldInner key={props.value} {...props} />
}

interface TextFieldProps {
  value: string
  label: string
  onCommit: (next: string) => void
  className?: string
  placeholder?: string
  multiline?: boolean
  /** A heading: one line of meaning that wraps instead of scrolling, with no box of its own. Enter saves. */
  heading?: boolean
  disabled?: boolean
}

function TextFieldInner({
  value,
  label,
  onCommit,
  className,
  placeholder,
  multiline = false,
  heading = false,
  disabled = false,
}: TextFieldProps) {
  const [text, setText] = useState(value)
  const commit = () => {
    if (text.trim() !== value.trim()) onCommit(text)
  }
  if (heading) {
    return (
      <Textarea
        variant="seamless"
        aria-label={label}
        className={className}
        rows={1}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value.replace(/\n/g, ' '))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setText(value)
            e.currentTarget.blur()
          }
        }}
      />
    )
  }
  if (multiline) {
    return (
      <Textarea
        aria-label={label}
        className={className}
        rows={3}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
    )
  }
  return (
    <Input
      aria-label={label}
      className={className}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          setText(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/** A day field. Saves on a whole, valid day; an empty field saves nothing unless `clearable`. */
export function DateField({
  value,
  label,
  onCommit,
  clearable = false,
  disabled = false,
}: {
  value: string
  label: string
  onCommit: (next: string | null) => void
  clearable?: boolean
  disabled?: boolean
}) {
  return (
    <Input
      key={value}
      type="date"
      aria-label={label}
      defaultValue={value}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value
        if (/^\d{4}-\d{2}-\d{2}$/.test(next)) {
          if (next !== value) onCommit(next)
        } else if (next === '' && clearable && value) onCommit(null)
      }}
    />
  )
}

/** A select over a list of choices. */
export function ChoiceField(props: ChoiceFieldProps) {
  return <ChoiceFieldInner key={props.value} {...props} />
}

interface ChoiceFieldProps {
  value: string
  label: string
  choices: readonly DetailsChoice[]
  onCommit: (next: string) => void
  emptyLabel?: string
  disabled?: boolean
}

function ChoiceFieldInner({
  value,
  label,
  choices,
  onCommit,
  emptyLabel,
  disabled = false,
}: ChoiceFieldProps) {
  const [picked, setPicked] = useState(value)
  return (
    <Select
      aria-label={label}
      value={picked}
      emptyLabel={emptyLabel}
      options={choices}
      disabled={disabled}
      onChange={(e) => {
        setPicked(e.target.value)
        if (e.target.value !== value) onCommit(e.target.value)
      }}
    />
  )
}

/** Runs one write at a time and keeps its sentence: a refusal stays on screen under the fields until
 *  the next write starts. `run` resolves true when the server said yes. */
export function useRun() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (job: () => Promise<Done>): Promise<boolean> => {
    setError(null)
    setBusy(true)
    try {
      const res = await job()
      if ('error' in res) {
        setError(res.error)
        return false
      }
      return true
    } catch {
      setError('Something went wrong. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }, [])
  return { error, busy, run, fail: setError }
}

/** The round check beside a to-do. It flips at once and goes back, with the server's sentence, if the write fails. */
export function TodoCheck({
  done,
  canEdit,
  onToggle,
  onError,
}: {
  done: boolean
  canEdit: boolean
  onToggle: (next: boolean) => Promise<Done>
  onError: (line: string) => void
}) {
  const [shown, setShown] = useOptimistic(done)
  const [, start] = useTransition()
  const look = (
    <span className="cal-check" data-done={shown || undefined} aria-hidden>
      {shown ? <FqIcon name="check" size={14} /> : null}
    </span>
  )
  if (!canEdit) {
    return (
      <span role="img" aria-label={shown ? 'Done' : 'Not done'}>
        {look}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="cal-checkbtn"
      aria-label="Toggle done"
      aria-pressed={shown}
      onClick={() =>
        start(async () => {
          const next = !shown
          setShown(next)
          try {
            const res = await onToggle(next)
            if ('error' in res) onError(res.error)
          } catch {
            onError('Something went wrong. Try again.')
          }
        })
      }
    >
      {look}
    </button>
  )
}
