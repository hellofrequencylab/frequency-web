'use client'

import { useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
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

// A 6-digit hex, the exact shape the native color picker emits + the write actions accept
// (lib/spaces/accent.ts isValidAccent). Kept local so this client file pulls no server module.
const HEX_RE = /^#[0-9a-fA-F]{6}$/

/**
 * The suggested brand-accent SWATCHES an owner can pick with one tap. Each carries a real DAWN palette
 * hex (app/globals.css light-mode base tokens), so they stay on-system, relabeled to warm, plain,
 * on-brand names (CONTENT-VOICE) — never the alert/semantic words (success/warning/danger/info) the
 * accent must not borrow. The owner can still pick ANY color with the picker beside them; a swatch is
 * just a fast on-brand start. The selected accent is stored as a hex.
 */
export const ACCENT_SWATCHES: { name: string; hex: string }[] = [
  { name: 'Sunrise', hex: '#E2912F' },
  { name: 'Bronze', hex: '#9A5E12' },
  { name: 'Clay', hex: '#B07515' },
  { name: 'Rose', hex: '#BA3B30' },
  { name: 'Forest', hex: '#0F8E78' },
  { name: 'Spruce', hex: '#11827A' },
  { name: 'Ocean', hex: '#1EB6C5' },
  { name: 'Harbor', hex: '#2F6FB0' },
]

/**
 * The brand-color picker: a real color picker (native + a hex input) for ANY color, a tight grid of
 * suggested on-brand swatches, and a "Default" clear. The selected value is a 6-digit hex (or '' to
 * clear, so the per-type default paints); a token NAME still round-trips for a legacy accent. The
 * server re-validates every value (isValidAccent), so this control is convenience, never the gate.
 */
export function AccentPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (accent: string) => void
  disabled?: boolean
}) {
  // The native color input needs a valid hex to seed; fall back to the first swatch when the stored
  // accent is a legacy token or empty (the widget shows a color, but nothing reads as selected).
  const currentHex = HEX_RE.test(value) ? value : null
  const [draft, setDraft] = useState(currentHex ?? '')
  // Reflect an external change (a swatch tap, a fresh initial) back into the hex input, using React's
  // render-time "adjust state on prop change" pattern (no effect, no cascading commit).
  const [seenHex, setSeenHex] = useState(currentHex)
  if (currentHex !== seenHex) {
    setSeenHex(currentHex)
    setDraft(currentHex ?? '')
  }

  const commitHex = (raw: string) => {
    const next = raw.trim()
    if (next === '') {
      onChange('')
      return
    }
    if (HEX_RE.test(next)) onChange(next)
  }
  const draftValid = draft.trim() === '' || HEX_RE.test(draft.trim())

  return (
    <Field
      id="brand-accent"
      label="Brand color"
      hint="Your accent. It paints your buttons, the active tab, and highlights across your page."
    >
      <div className="space-y-3">
        {/* The custom picker: a native color well + a hex field + a Default clear. */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            aria-label="Pick a brand color"
            value={currentHex ?? '#E2912F'}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1 disabled:cursor-default disabled:opacity-60"
          />
          <input
            type="text"
            inputMode="text"
            aria-label="Brand color hex"
            value={draft}
            disabled={disabled}
            placeholder="#E2912F"
            maxLength={7}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commitHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitHex(draft)
              }
            }}
            className={cn(
              'w-28 rounded-lg border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-primary placeholder:text-subtle disabled:opacity-60',
              draftValid ? 'border-border' : 'border-danger',
            )}
          />
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={disabled}
            aria-pressed={value === ''}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60',
              value === ''
                ? 'border-primary bg-primary-bg text-primary-strong'
                : 'border-border text-muted hover:border-border-strong',
            )}
          >
            Default
          </button>
        </div>
        {!draftValid && (
          <p className="text-xs font-medium text-danger">Enter a hex color like #E2912F.</p>
        )}

        {/* The suggested on-brand swatches: one tap sets the accent. */}
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {ACCENT_SWATCHES.map((s) => {
            const active = value.toLowerCase() === s.hex.toLowerCase()
            return (
              <button
                key={s.hex}
                type="button"
                onClick={() => onChange(s.hex)}
                disabled={disabled}
                aria-pressed={active}
                title={s.name}
                aria-label={s.name}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg border transition-transform disabled:opacity-60',
                  active
                    ? 'border-primary ring-2 ring-primary ring-offset-1 ring-offset-surface'
                    : 'border-border hover:scale-105 motion-reduce:hover:scale-100',
                )}
                style={{ backgroundColor: s.hex }}
              >
                {active && <Check className="h-4 w-4 text-white [filter:drop-shadow(0_1px_1px_rgb(0_0_0/0.5))]" aria-hidden />}
              </button>
            )
          })}
        </div>
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
