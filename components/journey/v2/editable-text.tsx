'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'

// A click-to-edit text field for the Journey editor's header — the Title and subtitle (ADR-301).
// It reads as the heading/subtitle it replaces, but a hover border + a pencil make it clearly
// editable. Commits on blur (and Enter, single-line only), when the value actually changed. The
// parent owns the save. Input/textarea are phrasing/flow content, valid inside PageHeading.
export function EditableText({
  value,
  onSave,
  placeholder,
  inputClassName = '',
  autoFocus = false,
  ariaLabel,
  multiline = false,
  rows = 3,
}: {
  value: string
  /** Called with the trimmed value when it changes and the field is committed. */
  onSave: (next: string) => void
  placeholder: string
  inputClassName?: string
  autoFocus?: boolean
  ariaLabel?: string
  /** Render a multi-line textarea (the subtitle) instead of a single-line input. */
  multiline?: boolean
  rows?: number
}) {
  const [val, setVal] = useState(value)
  const commit = () => {
    const next = val.trim()
    if (next !== value.trim()) onSave(next)
  }
  // A visible, lighter-than-canvas field so it clearly reads as editable.
  const base = `w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 outline-none transition-colors placeholder:font-normal placeholder:text-subtle hover:border-border-strong focus:border-primary focus:bg-canvas ${inputClassName}`

  return (
    <span className="group relative block w-full">
      {multiline ? (
        <textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          rows={rows}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          className={`${base} resize-y`}
        />
      ) : (
        <>
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            autoFocus={autoFocus}
            placeholder={placeholder}
            aria-label={ariaLabel ?? placeholder}
            className={`${base} pr-8`}
          />
          <Pencil
            className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </>
      )}
    </span>
  )
}
