'use client'

import { useState, useTransition, type ReactNode, type KeyboardEvent } from 'react'
import { useEditMode } from '@/lib/admin/use-edit-mode'
import { Input, Textarea } from '@/components/ui/field'

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
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!editing) return <>{children ?? value}</>

  const commit = () => {
    if (val.trim() === (value ?? '').trim()) return
    setError(null)
    startTransition(async () => {
      // The save action throws on failure (auth, validation, db) — surface it inline
      // instead of letting the field look saved until a refresh silently reverts it.
      try {
        await save(val.trim())
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save. Try again.")
      }
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    }
  }

  const cls = inputClassName ?? ''

  return (
    <>
      {multiline ? (
        <Textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={3}
          disabled={pending}
          className={`${cls} resize-none`}
        />
      ) : (
        <Input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={pending}
          className={cls}
        />
      )}
      {error && (
        <p role="alert" className="mt-1 text-meta text-danger">
          {error}
        </p>
      )}
    </>
  )
}
