'use client'

import { useState, useTransition, type ReactNode, type KeyboardEvent } from 'react'
import { useEditMode } from '@/lib/admin/use-edit-mode'

// A click-to-edit text field for the inline tuning layer (ADR-138). Out of Edit
// Mode it renders `children` (or the value as-is); in Edit Mode it becomes an
// input/textarea that saves on blur (or Enter, single-line) via the passed action.
// The action re-checks the capability server-side and patches ONE field — inline
// edits never touch the rest of the entity.
export function InlineText({
  value,
  save,
  multiline = false,
  placeholder,
  inputClassName,
  children,
}: {
  value: string | null
  /** Field-level save (the entity id/slug/field are already bound by the caller). */
  save: (next: string) => Promise<void>
  multiline?: boolean
  placeholder?: string
  inputClassName?: string
  /** What to render out of Edit Mode (defaults to the value text). */
  children?: ReactNode
}) {
  const { editing } = useEditMode()
  const [val, setVal] = useState(value ?? '')
  const [pending, startTransition] = useTransition()

  if (!editing) return <>{children ?? value}</>

  const commit = () => {
    if (val.trim() === (value ?? '').trim()) return
    startTransition(async () => {
      await save(val.trim())
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    }
  }

  const cls =
    inputClassName ??
    'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'

  return multiline ? (
    <textarea
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      placeholder={placeholder}
      rows={3}
      disabled={pending}
      className={`${cls} resize-none`}
    />
  ) : (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={pending}
      className={cls}
    />
  )
}
