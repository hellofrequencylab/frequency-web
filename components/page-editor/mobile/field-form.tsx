'use client'

// The MOBILE field form: generates a phone-native form from a block's Puck `fields`
// schema. We do NOT reuse Puck's own <AutoField> here on purpose — AutoField reads
// Puck's Zustand store (useAppStore) at the top of its body, so it only works mounted
// inside <Puck>. Mounting <Puck> would re-introduce the desktop 3-panel we are
// replacing. Instead we render each field from its declaration with DAWN inputs:
//
//   text / textarea / number / select / radio   -> native inputs (one field per row)
//   array                                        -> a list + a pushed sub-screen per row
//   object                                       -> a pushed sub-screen of its subfields
//   custom                                       -> the field's OWN render({ value, onChange })
//                                                   (self-contained; needs no Puck store)
//   slot / external                              -> not supported on mobile; edit on desktop
//
// Sub-choices (array rows, objects) PUSH another full screen — never a nested sheet
// (PAGE-FRAMEWORK / the mobile spec). The caller owns the screen stack; this component
// asks to push via `onPushScreen`.

import { useId } from 'react'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import { fieldClasses } from '@/components/ui/field'
import { Button } from '@/components/ui/button'

// ── Puck field shapes (structural; we only read what we render) ───────────────
type Option = { label: string; value: string | number | boolean }
type AnyField = {
  type: string
  label?: string
  options?: readonly Option[]
  arrayFields?: Record<string, AnyField>
  objectFields?: Record<string, AnyField>
  getItemSummary?: (item: unknown, index: number) => string
  defaultItemProps?: Record<string, unknown>
  render?: (props: { value: unknown; onChange: (v: unknown) => void; name?: string }) => React.ReactNode
}

export type FieldsSchema = Record<string, AnyField>

// A request to open a nested full-screen sub-form (object or array row). The shell
// pushes it onto the stack; on back it merges the sub-value into the parent value.
export type PushRequest = {
  title: string
  fields: FieldsSchema
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
}

function humanize(key: string): string {
  const s = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function labelFor(key: string, field: AnyField): string {
  return field.label ?? humanize(key)
}

// One labelled row wrapping a control. Generous vertical rhythm, >=44px targets.
function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-4 py-4">
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-text">
        {label}
      </label>
      {children}
    </div>
  )
}

// ── A single scalar / composite field control ────────────────────────────────
function FieldControl({
  fieldKey,
  field,
  value,
  onChange,
  onPushScreen,
}: {
  fieldKey: string
  field: AnyField
  value: unknown
  onChange: (v: unknown) => void
  onPushScreen: (req: PushRequest) => void
}) {
  const id = useId()
  const label = labelFor(fieldKey, field)

  switch (field.type) {
    case 'text':
      return (
        <Row label={label} htmlFor={id}>
          <input
            id={id}
            type="text"
            className={`${fieldClasses} min-h-[44px]`}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </Row>
      )

    case 'textarea':
      return (
        <Row label={label} htmlFor={id}>
          <textarea
            id={id}
            rows={4}
            className={fieldClasses}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </Row>
      )

    case 'number':
      return (
        <Row label={label} htmlFor={id}>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            className={`${fieldClasses} min-h-[44px]`}
            value={value === undefined || value === null ? '' : (value as number)}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </Row>
      )

    case 'select':
      return (
        <Row label={label} htmlFor={id}>
          <select
            id={id}
            className={`${fieldClasses} min-h-[44px]`}
            value={String(value ?? '')}
            onChange={(e) => {
              const opt = field.options?.find((o) => String(o.value) === e.target.value)
              onChange(opt ? opt.value : e.target.value)
            }}
          >
            {field.options?.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </Row>
      )

    case 'radio':
      // Rendered as a segmented set of >=44px pill buttons (thumb-friendly, no
      // hover dependency), the mobile-native equivalent of Puck's radio row.
      return (
        <Row label={label}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
            {field.options?.map((o) => {
              const active = String(value ?? '') === String(o.value)
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange(o.value)}
                  className={`min-h-[44px] rounded-lg border px-4 text-sm font-medium transition-colors ${
                    active
                      ? 'border-primary bg-primary text-on-primary'
                      : 'border-border bg-surface text-text hover:bg-surface-elevated'
                  }`}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </Row>
      )

    case 'object': {
      const objVal = (value as Record<string, unknown>) ?? {}
      return (
        <PushRow
          label={label}
          summary={summarizeObject(field.objectFields ?? {}, objVal)}
          onPress={() =>
            onPushScreen({
              title: label,
              fields: field.objectFields ?? {},
              value: objVal,
              onChange: (v) => onChange(v),
            })
          }
        />
      )
    }

    case 'array': {
      const arr = (Array.isArray(value) ? value : []) as Record<string, unknown>[]
      const sub = field.arrayFields ?? {}
      const summarize = (item: Record<string, unknown>, i: number) =>
        field.getItemSummary?.(item, i) || summarizeObject(sub, item) || `Item ${i + 1}`
      return (
        <div className="border-b border-border px-4 py-4">
          <div className="mb-2 text-sm font-medium text-text">{label}</div>
          <ul className="space-y-2">
            {arr.map((item, i) => (
              <li key={i} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onPushScreen({
                      title: `${label} ${i + 1}`,
                      fields: sub,
                      value: item,
                      onChange: (v) => {
                        const next = arr.slice()
                        next[i] = v
                        onChange(next)
                      },
                    })
                  }
                  className="flex min-h-[44px] flex-1 items-center justify-between rounded-lg border border-border bg-surface px-3 text-left text-sm text-text hover:bg-surface-elevated"
                >
                  <span className="truncate">{summarize(item, i)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${label} ${i + 1}`}
                  onClick={() => onChange(arr.filter((_, j) => j !== i))}
                  className="flex min-h-[44px] w-11 items-center justify-center rounded-lg border border-border text-danger hover:bg-danger-bg"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => onChange([...arr, { ...(field.defaultItemProps ?? {}) }])}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add item
          </Button>
        </div>
      )
    }

    case 'custom':
      // The block's own control (e.g. the image picker). It is self-contained —
      // render({ value, onChange }) — and does NOT depend on the Puck store, so it
      // mounts safely here. We keep a label row for rhythm.
      return (
        <Row label={label}>
          <div className="min-h-[44px]">
            {field.render?.({ value, onChange, name: fieldKey })}
          </div>
        </Row>
      )

    case 'slot':
    case 'external':
    default:
      // Nested drop-zones and external data sources need the desktop canvas. Rather
      // than hide the field, we say so plainly (no em dash, verb-led).
      return (
        <Row label={label}>
          <p className="text-sm text-subtle">Edit this on a larger screen.</p>
        </Row>
      )
  }
}

// A tappable row that pushes a sub-screen (objects). Big target, chevron affordance.
function PushRow({ label, summary, onPress }: { label: string; summary: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex min-h-[56px] w-full items-center justify-between border-b border-border px-4 py-3 text-left hover:bg-surface-elevated"
    >
      <span>
        <span className="block text-sm font-medium text-text">{label}</span>
        {summary && <span className="mt-0.5 block truncate text-xs text-subtle">{summary}</span>}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-subtle" aria-hidden />
    </button>
  )
}

function summarizeObject(fields: FieldsSchema, value: Record<string, unknown>): string {
  for (const key of Object.keys(fields)) {
    const v = value?.[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** Render a whole fields-schema as a stack of rows. Used for the block's top-level
 *  form and for every pushed object/array sub-screen. `onFieldCommit` fires after
 *  each change so the shell can autosave. */
export function FieldForm({
  fields,
  value,
  onChange,
  onPushScreen,
}: {
  fields: FieldsSchema
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  onPushScreen: (req: PushRequest) => void
}) {
  return (
    <div>
      {Object.entries(fields).map(([key, field]) => (
        <FieldControl
          key={key}
          fieldKey={key}
          field={field}
          value={value?.[key]}
          onChange={(v) => onChange({ ...value, [key]: v })}
          onPushScreen={onPushScreen}
        />
      ))}
    </div>
  )
}
