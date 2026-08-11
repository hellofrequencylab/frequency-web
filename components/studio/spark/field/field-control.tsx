'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE FIELD KIT (docs/STUDIO.md, ADR-597).
//
// ONE control per field KIND, never one per entity. This is the only place in the Studio a field
// is styled, which is the whole point: the survey found the same `const FIELD = 'w-full rounded-xl
// border …'` copy-pasted across seven wizards (and nineteen files repo-wide), so every wizard drifted
// a little further from every other. `pnpm check:studio` now fails a build that declares another one.
//
// The styling itself is NOT reinvented here: it composes the sitewide field primitives
// (components/ui/field.tsx), so the Studio inherits the standard focus halo and token colors for
// free and stays consistent with the rest of the product, not just with itself.
//
// Adding a control is a KERNEL change (a new entry in FIELD_KINDS + a case below), which every
// entity then inherits. An entity manifest can never introduce a control of its own.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { X } from 'lucide-react'
import { Input, Textarea, fieldClasses } from '@/components/ui/field'
import { ImageUpload } from '@/components/ui/image-upload'
import { MultiImageUpload } from '@/components/ui/multi-image-upload'
import type { FieldDef, FieldKind } from '@/lib/studio/kernel/manifest'
import { cn } from '@/lib/utils'

/**
 * Loaded options, keyed by the manifest's `optionsFrom` NAME (not by field path), so one loaded
 * collection serves every field that draws from it. A manifest says WHICH collection a choice
 * comes from; the surface, which can query, supplies the rows.
 *
 *   <FieldControl def={f} loaded={{ circles: myCircles, spaces: mySpaces }} … />
 */
export type FieldOptions = Record<string, readonly FieldOption[]>

/** One choice. Mirrors the kernel's `FieldOption`. */
type FieldOption = { value: string; label: string }

export interface FieldControlProps {
  def: FieldDef
  /** The current value. Arrays are used by `tags` and `images`; everything else is a string. */
  value: string | string[]
  onChange: (next: string | string[]) => void
  /** Collections the surface loaded, keyed by `optionsFrom` name. */
  loaded?: FieldOptions
  disabled?: boolean
  /** Rendered under the control (a hint, or a validation reason). */
  hint?: string
  id?: string
}

/**
 * The options for a choice field: the manifest's own closed set when it declares one, otherwise
 * the collection the surface loaded under the declared `optionsFrom` name. PURE.
 *
 * Returns empty when a field declares `optionsFrom` and the surface did not supply it. That is a
 * wiring mistake, and an empty dropdown makes it obvious immediately rather than silently
 * rendering someone else's list.
 */
function optionsFor(def: FieldDef, loaded?: FieldOptions): readonly FieldOption[] {
  if (def.options) return def.options
  if (def.optionsFrom) return loaded?.[def.optionsFrom] ?? []
  return []
}

/** Kinds that map straight onto a native input type. */
const NATIVE_INPUT: Partial<Record<FieldKind, string>> = {
  text: 'text',
  slug: 'text',
  url: 'url',
  email: 'email',
  phone: 'tel',
  address: 'text',
  hours: 'text',
  cadence: 'text',
  place: 'text',
  number: 'number',
  price: 'number',
  duration: 'number',
  rating: 'text',
  date: 'date',
  datetime: 'datetime-local',
}

/** Per-kind input affordances that make a control feel right on a phone keyboard. */
const INPUT_MODE: Partial<Record<FieldKind, 'text' | 'url' | 'email' | 'tel' | 'numeric' | 'decimal'>> = {
  url: 'url',
  email: 'email',
  phone: 'tel',
  price: 'decimal',
  number: 'numeric',
  duration: 'numeric',
}

const asText = (v: string | string[]): string => (Array.isArray(v) ? v.join(', ') : v)
const asList = (v: string | string[]): string[] => (Array.isArray(v) ? v : v ? [v] : [])

/**
 * Render the control for one declared field. Controlled: the caller owns the value and the save,
 * exactly like the rest of the Studio kit, so this composes with autosave or with a staged wizard
 * without knowing which it is in.
 */
export function FieldControl({ def, value, onChange, loaded, disabled, hint, id }: FieldControlProps) {
  const describedBy = hint ? `${id ?? def.path}-hint` : undefined
  const control = renderControl({ def, value, onChange, loaded, disabled, id, describedBy })

  return (
    <div>
      {control}
      {hint && (
        <p id={describedBy} className="mt-1.5 text-2xs text-subtle">
          {hint}
        </p>
      )}
    </div>
  )
}

function renderControl({
  def,
  value,
  onChange,
  loaded,
  disabled,
  id,
  describedBy,
}: Omit<FieldControlProps, 'hint'> & { describedBy?: string }) {
  const common = { id: id ?? def.path, disabled, 'aria-describedby': describedBy }

  switch (def.kind) {
    case 'longtext':
      return (
        <Textarea
          {...common}
          rows={5}
          className="min-h-24 resize-y"
          value={asText(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    // A closed choice and a pointer to another row render the same way; they differ only in where
    // the choices come from, which `optionsFor` already resolved.
    case 'select':
    case 'reference': {
      const choices = optionsFor(def, loaded)
      return (
        <select {...common} className={fieldClasses} value={asText(value)} onChange={(e) => onChange(e.target.value)}>
          {/* An optional field needs a way back to "unset", and a reference that has not loaded
              yet needs to say so rather than looking like an empty list of real choices. */}
          {!def.required && <option value="">{def.kind === 'reference' ? 'None' : 'Not set'}</option>}
          {choices.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    }

    case 'toggle':
      return (
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            {...common}
            type="checkbox"
            checked={asText(value) === 'true'}
            onChange={(e) => onChange(String(e.target.checked))}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span>{def.label}</span>
        </label>
      )

    case 'tags':
      return <TagsControl {...common} value={asList(value)} onChange={onChange} />

    // A design token name or a hex. The native swatch cannot express a token, so the text box is
    // authoritative and the swatch is an assist beside it.
    case 'color':
      return (
        <div className="flex items-center gap-2">
          <Input {...common} value={asText(value)} onChange={(e) => onChange(e.target.value)} />
          <input
            type="color"
            aria-label={`${def.label} swatch`}
            disabled={disabled}
            value={/^#[0-9a-f]{6}$/i.test(asText(value)) ? asText(value) : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1"
          />
        </div>
      )

    case 'image':
      return (
        <ImageUpload
          value={asText(value) || null}
          onChange={(next) => onChange(next ?? '')}
          label={def.label}
          disabled={disabled}
        />
      )

    case 'images':
      return (
        <MultiImageUpload
          value={asList(value)}
          onChange={(next) => onChange(next)}
          label={def.label}
          disabled={disabled}
        />
      )

    // `daterange` is two instants. The manifest declares one field; the control renders the pair
    // and stores them as an ISO tuple, so an entity never has to declare "start" and "end" twice.
    case 'daterange':
      return <DateRangeControl {...common} value={asList(value)} onChange={onChange} />

    default:
      return (
        <Input
          {...common}
          type={NATIVE_INPUT[def.kind] ?? 'text'}
          inputMode={INPUT_MODE[def.kind]}
          {...(def.kind === 'price' || def.kind === 'number' || def.kind === 'duration'
            ? { min: 0, step: def.kind === 'price' ? '0.01' : '1' }
            : {})}
          value={asText(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

// ── Composite controls ───────────────────────────────────────────────────────────────────

/** A chip list with a type-to-add box. Enter or comma commits; backspace on an empty box removes
 *  the last chip (the behaviour people expect from every tag input they have used). */
function TagsControl({
  value,
  onChange,
  disabled,
  id,
  'aria-describedby': describedBy,
}: {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  id?: string
  'aria-describedby'?: string
}) {
  const [entry, setEntry] = useState('')

  const commit = (raw: string) => {
    const next = raw.trim().replace(/,$/, '')
    if (!next || value.includes(next)) return setEntry('')
    onChange([...value, next])
    setEntry('')
  }

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted transition-colors hover:text-text disabled:opacity-50"
              >
                {tag}
                <X className="h-3 w-3" aria-hidden />
                <span className="sr-only">Remove {tag}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        disabled={disabled}
        aria-describedby={describedBy}
        value={entry}
        placeholder="Type and press Enter"
        onChange={(e) => (e.target.value.endsWith(',') ? commit(e.target.value) : setEntry(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(entry)
          } else if (e.key === 'Backspace' && !entry && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => entry && commit(entry)}
      />
    </div>
  )
}

/** Start and end, as one declared field. Stored as `[startIso, endIso]`. */
function DateRangeControl({
  value,
  onChange,
  disabled,
  id,
  'aria-describedby': describedBy,
}: {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  id?: string
  'aria-describedby'?: string
}) {
  const [start = '', end = ''] = value
  return (
    <div className={cn('grid gap-2', 'sm:grid-cols-2')}>
      <label className="block">
        <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-subtle">Starts</span>
        <Input
          id={id}
          type="datetime-local"
          disabled={disabled}
          aria-describedby={describedBy}
          value={start}
          onChange={(e) => onChange([e.target.value, end])}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-subtle">Ends</span>
        <Input
          type="datetime-local"
          disabled={disabled}
          value={end}
          // An end before the start is the single most common date mistake, so the control
          // refuses it inline rather than letting the server reject the whole submission later.
          min={start || undefined}
          onChange={(e) => onChange([start, e.target.value])}
        />
      </label>
    </div>
  )
}
