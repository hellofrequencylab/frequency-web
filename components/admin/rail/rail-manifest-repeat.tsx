'use client'

// ─────────────────────────────────────────────────────────────────────────────
// A REPEAT GROUP IN THE RAIL (ADR-1309, docs/EDITING-SYSTEM.md §2).
//
// The sibling of `RailManifestFields`, for the other half of a manifest. A `RepeatDef` is a TABLE
// OF ROWS — an Event's ticket tiers, its set times, its links — and until this existed there was
// no rail representation of one at all: `railForm()` walked `manifest.fields` and stopped, so
// every repeated collection Vera harvested was reviewable on the board, rendered on the page, and
// editable NOWHERE. That is the owner report this closes: "there's a block for Schedule, but I
// have no way to edit the schedule."
//
// WHAT IT DECLARES: nothing. Each row renders the group's OWN `fields` through the SAME
// `FieldControl` every other surface uses (one control per KIND, never one per entity — the rule
// `pnpm check:studio` holds), and each row is titled by the group's own `itemLabel`. The list adds,
// removes and reorders; that is the only behaviour this file owns.
//
// WHY IT COMMITS ITSELF. Add, remove and reorder are PROGRAMMATIC: a `<button type="button">` fires
// no change or blur, so the enclosing `RailAutosaveForm` cannot hear one, exactly as a dragged map
// pin cannot be heard. Those three call `useRailSaveNow()` — always, on every surface, because a
// structural change is never something the form could pick up on its own. Typing inside a row's own
// control still commits on blur like any other field, so a half-typed tier never saves mid-word.
// ─────────────────────────────────────────────────────────────────────────────

import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { labelClasses } from '@/components/ui/field'
import { FieldControl, type FieldOptions } from '@/components/studio/spark/field/field-control'
import { REPEAT_ITEM_SELF, repeatLabel, type FieldDef, type RepeatDef } from '@/lib/studio/kernel/manifest'
import { useRailSaveNow } from './rail-autosave-form'
import { joinFieldValue, splitFieldValue, type RepeatRow } from './rail-field-value'

export type { RepeatRow }

export interface RailManifestRepeatProps {
  /** The manifest's own group. Its `fields`, its `itemLabel`, and its name all come from here. */
  def: RepeatDef
  /** The current rows, in order. */
  rows: readonly RepeatRow[]
  onChange: (next: RepeatRow[]) => void
  /**
   * The most rows the SERVER will keep. Not decoration: the details coercion caps every collection
   * (8 tiers, 24 slots, 10 links), and a row typed past the cap is dropped on save with nothing
   * said. The control stops offering Add at the cap and says why instead.
   */
  max?: number
  /** Loaded collections for a row field that draws its choices from one. */
  loaded?: FieldOptions
  disabled?: boolean
}

/** A repeat field's label read as a sentence. The manifest writes these lowercase because the review
 *  board prefixes each with the row's name ("Tier 1 price"); a rail heads the row instead, so the
 *  label stands alone and starts like a label. PURE, and copy is never invented here. */
function sentence(label: string): string {
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : label
}

/** An empty row: every declared field present and blank, so a fresh row is a controlled one. */
function blankRow(def: RepeatDef): RepeatRow {
  return Object.fromEntries(def.fields.map((f) => [f.path, '']))
}

/** A row's title, from the group's own `itemLabel`. Total: a group whose labeller throws on a blank
 *  row would take the whole rail down, and a new row is blank by construction. */
function rowTitle(def: RepeatDef, row: RepeatRow, index: number): string {
  try {
    return def.itemLabel(row, index, String(index)) || `${repeatLabel(def)} ${index + 1}`
  } catch {
    return `${repeatLabel(def)} ${index + 1}`
  }
}

export function RailManifestRepeat({ def, rows, onChange, max, loaded, disabled }: RailManifestRepeatProps) {
  const saveNow = useRailSaveNow()
  const name = repeatLabel(def)
  const atCap = typeof max === 'number' && rows.length >= max

  /** Every structural change lands the same way: new order, then commit, because nothing else can. */
  const commit = (next: RepeatRow[]) => {
    onChange(next)
    saveNow()
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) return
    const next = [...rows]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    commit(next)
  }

  return (
    <div className="space-y-2">
      <p className={labelClasses}>{name}</p>

      {rows.length === 0 ? (
        <p className="text-2xs text-muted">Nothing here yet. Add the first one and it shows on the event page.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, index) => {
            const title = rowTitle(def, row, index)
            return (
              <li key={`${def.arrayPath}-${index}`} className="space-y-2 rounded-card border border-border bg-surface p-2.5">
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-meta font-semibold text-text">{title}</span>
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    onClick={() => move(index, index - 1)}
                    aria-label={`Move ${title} up`}
                    className="rounded-control border border-border p-1 text-muted transition-colors hover:text-text disabled:opacity-40"
                  >
                    <ArrowUp className="h-3 w-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === rows.length - 1}
                    onClick={() => move(index, index + 1)}
                    aria-label={`Move ${title} down`}
                    className="rounded-control border border-border p-1 text-muted transition-colors hover:text-text disabled:opacity-40"
                  >
                    <ArrowDown className="h-3 w-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => commit(rows.filter((_, i) => i !== index))}
                    aria-label={`Remove ${title}`}
                    className="rounded-control border border-border p-1 text-muted transition-colors hover:text-danger disabled:opacity-40"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </div>

                {def.fields.map((f) => {
                  // The row's control, from the MANIFEST's declaration. `section` is inherited (the
                  // group's), and the id is per row so two tiers' price boxes are separately named.
                  const controlId = `${def.arrayPath}-${index}-${f.path || 'value'}`
                  const fieldDef: FieldDef = { ...f, section: def.section }
                  const label = f.path === REPEAT_ITEM_SELF ? name : sentence(f.label)
                  return (
                    <div key={controlId} className="space-y-1">
                      {f.kind !== 'toggle' && (
                        <label htmlFor={controlId} className={labelClasses}>
                          {label}
                        </label>
                      )}
                      <FieldControl
                        def={fieldDef}
                        id={controlId}
                        value={splitFieldValue(f.kind, row[f.path])}
                        onChange={(next) => {
                          const merged = { ...row, [f.path]: joinFieldValue(next) }
                          const list = rows.map((r, i) => (i === index ? merged : r))
                          // A choice or a switch inside a row is an instant answer the form CAN
                          // hear; a typed box commits on its own blur. Neither needs a nudge here.
                          onChange(list)
                        }}
                        loaded={loaded}
                        disabled={disabled}
                      />
                    </div>
                  )
                })}
              </li>
            )
          })}
        </ul>
      )}

      {atCap ? (
        <p className="text-2xs text-muted">This list holds up to {max}. Remove one to add another.</p>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => commit([...rows, blankRow(def)])}
          // A rail can carry three of these at once, so the button says WHICH list it adds to. The
          // visible word stays short because the group's own name is the heading right above it.
          aria-label={`Add to ${name}`}
          className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add
        </button>
      )}
    </div>
  )
}
