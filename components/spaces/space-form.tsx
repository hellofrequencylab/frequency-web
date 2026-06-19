'use client'

import { type ReactNode } from 'react'
import { Input, Textarea, Label } from '@/components/ui/field'
import { cn } from '@/lib/utils'

// SHARED SPACE FORM KIT (ENTITY-SPACES-BUILD Wave B). The small set of labeled field primitives
// the create wizard (/spaces/new) and the owner settings surface (/spaces/<slug>/settings) both
// compose, so the two forms read identically and neither hand-rolls field chrome. Built on the kit
// field primitives (components/ui/field.tsx) + DAWN tokens only (no hex, no text-[Npx]).
//
// Copy passes CONTENT-VOICE: plain labels + helper sentences, no narrated feelings, no em/en dashes.

/** A labeled form row: a label, the control (children), and an optional helper/hint line. The
 *  `action` slot sits beside the label (e.g. a "Draft with Vera" button next to About). */
export function Field({
  id,
  label,
  hint,
  action,
  children,
}: {
  id: string
  label: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <Label htmlFor={id} className="font-semibold">
          {label}
        </Label>
        {action}
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  )
}

/** A single-line text field row. */
export function TextField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  maxLength,
  required,
  action,
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
  required?: boolean
  action?: ReactNode
}) {
  return (
    <Field id={id} label={label} hint={hint} action={action}>
      <Input
        id={id}
        name={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
      />
    </Field>
  )
}

/** A multi-line text field row. */
export function TextareaField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 5,
  maxLength,
  action,
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  maxLength?: number
  action?: ReactNode
}) {
  return (
    <Field id={id} label={label} hint={hint} action={action}>
      <Textarea
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
      />
    </Field>
  )
}

/** The network/private visibility choice — two radio-style options. Default 'network'. */
export function VisibilityField({
  value,
  onChange,
}: {
  value: 'network' | 'private'
  onChange: (v: 'network' | 'private') => void
}) {
  const options: { value: 'network' | 'private'; label: string; hint: string }[] = [
    { value: 'network', label: 'Network', hint: 'Listed in the Spaces directory for anyone to find.' },
    { value: 'private', label: 'Private', hint: 'Hidden from the directory. Only you and your members can open it.' },
  ]
  return (
    <Field id="visibility" label="Visibility">
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const active = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                active
                  ? 'border-primary bg-primary-bg'
                  : 'border-border bg-surface hover:border-border-strong',
              )}
            >
              <span className="block text-sm font-semibold text-text">{o.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{o.hint}</span>
            </button>
          )
        })}
      </div>
    </Field>
  )
}

/**
 * The curated brand-accent tokens an owner may pick. Each is a DAWN semantic token NAME that is
 * also in lib/theme/validate.ts TOKEN_ALLOWLIST (the server re-validates against that exact set),
 * so the accent is always an on-system token, never a raw hex (D4 "the accent is a guest", D6
 * tokens only). The swatch renders the token via `var(--…)` so it tracks the live palette.
 */
export const ACCENT_TOKENS: { token: string; label: string }[] = [
  { token: '--color-primary', label: 'Primary' },
  { token: '--color-signal', label: 'Signal' },
  { token: '--color-broadcast', label: 'Broadcast' },
  { token: '--color-success', label: 'Success' },
  { token: '--color-warning', label: 'Warning' },
  { token: '--color-info', label: 'Info' },
]

/** A curated accent picker over ACCENT_TOKENS, plus a "None" clear. The selected value is a token
 *  NAME (or '' for none) the server re-validates against TOKEN_ALLOWLIST. */
export function AccentPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (token: string) => void
}) {
  return (
    <Field id="brand-accent" label="Brand accent" hint="An on-brand highlight color, picked from the palette.">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange('')}
          aria-pressed={value === ''}
          className={cn(
            'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
            value === '' ? 'border-primary bg-primary-bg text-primary-strong' : 'border-border text-muted hover:border-border-strong',
          )}
        >
          None
        </button>
        {ACCENT_TOKENS.map((a) => {
          const active = value === a.token
          return (
            <button
              key={a.token}
              type="button"
              onClick={() => onChange(a.token)}
              aria-pressed={active}
              title={a.label}
              aria-label={a.label}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                active ? 'border-primary bg-primary-bg text-text' : 'border-border text-muted hover:border-border-strong',
              )}
            >
              <span
                className="h-4 w-4 rounded-full border border-border"
                style={{ backgroundColor: `var(${a.token})` }}
                aria-hidden
              />
              {a.label}
            </button>
          )
        })}
      </div>
    </Field>
  )
}

/** A small inline error banner for a failed save. */
export function FormError({ message }: { message: string }) {
  return (
    <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
      {message}
    </p>
  )
}
