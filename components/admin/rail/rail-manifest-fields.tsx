'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RAIL FIELDS FROM A PLAN (docs/EDITING-SYSTEM.md §2, ADR-1240).
//
// The Inspector rail's consumer of the kernel's edit plan. A rail module hands in the fields
// `railForm()` gave it and the entity's current values; this renders one labelled control per
// field through the Studio field kit (ONE control per KIND, components/studio/spark/field), with
// the native `name` a RailAutosaveForm reads back off its own FormData.
//
// It declares no field of its own and knows no entity. Layout is decided by KIND, not by the
// caller: a short control (a number, a duration, a closed choice) pairs with its neighbour in a
// two-column grid, exactly as the hand-written rails laid theirs out; prose runs full width.
// ─────────────────────────────────────────────────────────────────────────────

import { labelClasses } from '@/components/ui/field'
import { FieldControl, type FieldOptions } from '@/components/studio/spark/field/field-control'
import type { FieldDef, FieldKind } from '@/lib/studio/kernel/manifest'
import { joinFieldValue, splitFieldValue } from './rail-field-value'

/** The kinds that read well at half width, so two of them share a row. */
const SHORT: ReadonlySet<FieldKind> = new Set<FieldKind>([
  'number',
  'duration',
  'price',
  'select',
  'reference',
  'date',
  'datetime',
  'toggle',
])

export interface RailManifestFieldsProps {
  /** The fields to render, in the order the plan gave them (manifest order). */
  fields: readonly FieldDef[]
  /** The current value of each field, keyed by manifest path. Absent reads as empty. */
  values: Record<string, string>
  onChange: (path: string, next: string) => void
  /** Ghost text per path. A prop, not manifest data: an example is tuned to the surface asking. */
  placeholders?: Record<string, string>
  /** Standing guidance under a control, per path. The surface's, for the same reason as a placeholder. */
  hints?: Record<string, string>
  /** Loaded collections for `optionsFrom` fields, keyed by the collection name. */
  loaded?: FieldOptions
  disabled?: boolean
}

/** Consecutive short fields fold into one row; everything else stands alone. */
function rows(fields: readonly FieldDef[]): FieldDef[][] {
  const out: FieldDef[][] = []
  for (const f of fields) {
    const last = out[out.length - 1]
    if (SHORT.has(f.kind) && last && last.length === 1 && SHORT.has(last[0].kind)) last.push(f)
    else out.push([f])
  }
  return out
}

export function RailManifestFields({
  fields,
  values,
  onChange,
  placeholders,
  hints,
  loaded,
  disabled,
}: RailManifestFieldsProps) {
  return (
    <>
      {rows(fields).map((row) => {
        const cells = row.map((def) => (
          <div key={def.path} className="block space-y-1.5">
            {/* A toggle carries its own label inside the control, and a `repeat` is a GROUP of
                controls that names itself — a `<label>` pointing at a group names nothing
                (ADR-966), so neither gets one from here. */}
            {def.kind !== 'toggle' && def.kind !== 'repeat' && (
              <label htmlFor={def.path} className={labelClasses}>
                {def.label}
              </label>
            )}
            <FieldControl
              def={def}
              name={def.path}
              // A LIST kind's control takes and returns an array; the values bag and the FormData
              // carry one string. `rail-field-value.ts` owns both halves of that conversion —
              // handing the joined string straight back is how three tags became one chip
              // spelled "a, b, c" on the Journey rail (ADR-1309).
              value={splitFieldValue(def.kind, values[def.path])}
              onChange={(next) => onChange(def.path, joinFieldValue(next))}
              placeholder={placeholders?.[def.path]}
              hint={hints?.[def.path]}
              loaded={loaded}
              disabled={disabled}
              // The whole value bag, for the one composite that cannot render from its own value
              // alone: a repeat rule is a sentence about the thing's START, so the picker derives
              // its presets and its weekday from `values.startsAt`. See FieldControlProps.siblings.
              siblings={values}
            />
          </div>
        ))
        return row.length > 1 ? (
          <div key={row.map((f) => f.path).join('+')} className="grid grid-cols-2 gap-3">
            {cells}
          </div>
        ) : (
          cells[0]
        )
      })}
    </>
  )
}
