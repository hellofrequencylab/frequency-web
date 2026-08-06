'use client'

import { useId } from 'react'
import { KNOWN_ROUTES } from './known-routes'
import { Input } from '@/components/ui/field'

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
      <label htmlFor={inputId} className="mb-1 block text-meta font-semibold text-subtle">
        {label}
      </label>
      <Input
        id={inputId}
        type="text"
        list={listId}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="!px-2.5 !py-1.5"
      />
      <datalist id={listId}>
        {KNOWN_ROUTES.map((r) => (
          <option key={r.href} value={r.href}>
            {r.label}
          </option>
        ))}
      </datalist>
      <p className="mt-1 text-meta text-subtle">
        Pick a known route or type any custom or external URL.
      </p>
    </div>
  )
}
