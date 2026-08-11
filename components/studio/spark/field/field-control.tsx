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
import { ImageIcon, X } from 'lucide-react'
import { Input, Textarea, fieldClasses } from '@/components/ui/field'
import { LoomPicker } from '@/components/loom/loom-picker'
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
  /**
   * Which Loom scope the picker opens in (ADR-987: the Loom is the only image picker). Pass a Space
   * id when editing inside a Space, so a pick files into that Space's library and is reusable there.
   *
   * Omit it and the picker opens the member's own Loom plus every Space they operate. That is what
   * lets a SPACE-LESS entity (a Practice, a Journey, a Circle) carry image fields at all: the member
   * always has a Loom of their own, so there is no surface left needing a direct-upload escape hatch.
   */
  scopeKey?: string
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
export function FieldControl({ def, value, onChange, loaded, scopeKey, disabled, hint, id }: FieldControlProps) {
  const describedBy = hint ? `${id ?? def.path}-hint` : undefined
  const control = renderControl({ def, value, onChange, loaded, scopeKey, disabled, id, describedBy })

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
  scopeKey,
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
            // A native <input type="color"> requires a literal 7-char hex and cannot take a token. This
            // is only the fallback swatch shown when the field holds a TOKEN NAME rather than a hex, so
            // it is never a rendered brand color; the text box beside it stays authoritative.
            // token-ok: native color input cannot accept a design token
            value={/^#[0-9a-f]{6}$/i.test(asText(value)) ? asText(value) : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1"
          />
        </div>
      )

    // ONE image control everywhere: the Loom (ADR-987). A pick or an upload lands in a real library
    // and is reusable, so there is deliberately no direct-upload path here.
    case 'image':
      return (
        <LoomImageSlot
          value={asText(value)}
          onChange={(next) => onChange(next)}
          label={def.label}
          scopeKey={scopeKey}
          disabled={disabled}
        />
      )

    case 'images':
      return (
        <LoomImageSlot
          multiple
          values={asList(value)}
          onChange={(next) => onChange(next)}
          label={def.label}
          scopeKey={scopeKey}
          disabled={disabled}
        />
      )

    // `daterange` is two instants. The manifest declares ONE field; the control renders the pair and
    // stores them as an ISO tuple, so an entity never has to declare "start" and "end" twice.
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

/**
 * An image slot backed by the Loom. Shows what is chosen, opens the picker to change it, and (in
 * `multiple` mode) keeps an ordered list. There is no file input here on purpose: every image on
 * the platform goes through the Loom so it is catalogued and reusable (ADR-987).
 */
function LoomImageSlot({
  value,
  values,
  onChange,
  label,
  scopeKey,
  disabled,
  multiple,
}: {
  value?: string
  values?: string[]
  onChange: (next: string & string[]) => void
  label: string
  scopeKey?: string
  disabled?: boolean
  multiple?: boolean
}) {
  const [open, setOpen] = useState(false)
  const list = values ?? []

  return (
    <div>
      {multiple && list.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {list.map((url, i) => (
            <li key={`${url}-${i}`} className="flex items-center gap-2">
              {/* A plain img, not next/image: these are operator-chosen Loom URLs at thumbnail size
                  inside an editor, so optimization buys nothing and the domain allow-list would have
                  to know every storage host. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover" />
              <span className="min-w-0 flex-1 truncate text-2xs text-muted">{url}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(list.filter((_, j) => j !== i) as string & string[])}
                className="shrink-0 rounded-lg border border-border p-1 text-muted transition-colors hover:text-text disabled:opacity-50"
              >
                <X className="h-3 w-3" aria-hidden />
                <span className="sr-only">Remove image {i + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!multiple && value && (
        <div className="mb-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover" />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange('' as string & string[])}
            className="rounded-lg border border-border p-1.5 text-muted transition-colors hover:text-text disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">Remove {label}</span>
          </button>
        </div>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
      >
        <ImageIcon className="h-3.5 w-3.5" aria-hidden />
        {multiple ? 'Add from the Loom' : value ? 'Change' : 'Choose from the Loom'}
      </button>

      {open && (
        <LoomPicker
          open={open}
          onClose={() => setOpen(false)}
          title={multiple ? `Add to ${label}` : `Choose ${label}`}
          scopeKey={scopeKey}
          kinds={['image']}
          multiple={multiple}
          onSelect={(url) => onChange(url as string & string[])}
          onSelectMany={(urls) => onChange([...list, ...urls] as string & string[])}
        />
      )}
    </div>
  )
}

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
