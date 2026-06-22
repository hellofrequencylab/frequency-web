'use client'

import { useId } from 'react'
import { KNOWN_ROUTES } from './known-routes'

// A link-target input that offers a <datalist> of curated in-app routes for
// autocomplete while still accepting any free-typed value (custom or external URL).
// Requirement 11. The datalist is suggestion only, never a hard constraint.
export function LinkTargetField({
  value,
  onChange,
  disabled,
  id,
  label = 'Link target',
  placeholder = '/feed or https://…',
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  id?: string
  label?: string
  placeholder?: string
}) {
  const reactId = useId()
  const listId = `routes-${reactId}`
  const inputId = id ?? `link-${reactId}`
  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className="mb-1 block text-xs font-semibold text-subtle">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        list={listId}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-canvas/40 px-2.5 py-1.5 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      />
      <datalist id={listId}>
        {KNOWN_ROUTES.map((r) => (
          <option key={r.href} value={r.href}>
            {r.label}
          </option>
        ))}
      </datalist>
      <p className="mt-1 text-xs text-subtle">
        Pick a known route or type any custom or external URL.
      </p>
    </div>
  )
}
