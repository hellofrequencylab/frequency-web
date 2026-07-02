'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, AlertCircle, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { createSegment, updateSegment, previewSegment, type SegmentActionResult } from './actions'
import type {
  Combinator,
  Predicate,
  TraitOp,
  ScalarValue,
  SegmentDefinition,
} from '@/lib/traits/segments'

// The Segment Builder (ADR-069 Phase 3 → P5). A client surface that composes a
// SegmentDefinition (combinator + predicate rows) and shows a debounced live "matches N
// members" preview by calling previewSegment over the real member snapshots. Pickers are
// populated from the trait registry passed in by the server page. Operator-facing copy:
// plain + functional (docs/CONTENT-VOICE.md), no em dashes.

/** A picker option for the registry-backed key dropdowns. */
export interface TraitOption {
  key: string
  label: string
  /** For computed traits: how its value is compared (drives the value control). */
  type?: 'boolean' | 'number' | 'string' | 'enum' | 'timestamp'
  /** For enum traits: the allowed values. */
  values?: readonly string[]
}

export interface ComposerInitial {
  id?: string
  name: string
  description: string
  definition: SegmentDefinition
}

const OPS: { value: TraitOp; label: string }[] = [
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
  { value: 'gt', label: 'greater than' },
  { value: 'gte', label: 'at least' },
  { value: 'lt', label: 'less than' },
  { value: 'lte', label: 'at most' },
]

// A row in editing state. `op`/`value` only matter for trait rows; we keep them around so
// switching a row's type back and forth doesn't lose what was typed.
interface RowState {
  rid: string
  type: 'tag' | 'trait'
  key: string
  op: TraitOp
  value: string
}

let RID = 0
const nextRid = () => `r${RID++}`

function rowFromPredicate(p: Predicate): RowState {
  return p.type === 'tag'
    ? { rid: nextRid(), type: 'tag', key: p.key, op: 'eq', value: '' }
    : { rid: nextRid(), type: 'trait', key: p.key, op: p.op, value: String(p.value) }
}

/** Coerce a row's string value to the scalar its trait expects. */
function coerceValue(raw: string, type: TraitOption['type']): ScalarValue {
  if (type === 'boolean') return raw === 'true'
  if (type === 'number') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : raw
  }
  return raw
}

/** Build a SegmentDefinition from the editing rows (skips rows with no key chosen). */
function toDefinition(
  combinator: Combinator,
  rows: RowState[],
  traitByKey: Map<string, TraitOption>,
): SegmentDefinition {
  const predicates: Predicate[] = []
  for (const r of rows) {
    if (!r.key) continue
    if (r.type === 'tag') {
      predicates.push({ type: 'tag', key: r.key })
    } else {
      const t = traitByKey.get(r.key)
      predicates.push({ type: 'trait', key: r.key, op: r.op, value: coerceValue(r.value, t?.type) })
    }
  }
  return { combinator, predicates }
}

export function SegmentComposer({
  tags,
  traits,
  initial,
}: {
  tags: TraitOption[]
  traits: TraitOption[]
  initial?: ComposerInitial
}) {
  const router = useRouter()
  const isEdit = Boolean(initial?.id)

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [combinator, setCombinator] = useState<Combinator>(initial?.definition.combinator ?? 'all')
  const [rows, setRows] = useState<RowState[]>(
    initial && initial.definition.predicates.length
      ? initial.definition.predicates.map(rowFromPredicate)
      : [{ rid: nextRid(), type: 'tag', key: '', op: 'eq', value: '' }],
  )
  const [result, setResult] = useState<SegmentActionResult | null>(null)
  const [pending, start] = useTransition()

  const traitByKey = useMemo(() => new Map(traits.map((t) => [t.key, t])), [traits])
  const definition = useMemo(() => toDefinition(combinator, rows, traitByKey), [combinator, rows, traitByKey])

  // ── Debounced live preview ────────────────────────────────────────────────
  // Keyed on the whole definition; the count + the def it counted are stored together so a
  // stale count is never shown for a newer definition (we compare keys at render).
  const [preview, setPreview] = useState<{ key: string; count: number; valid: boolean } | null>(null)
  const hasRules = definition.predicates.length > 0
  const defKey = JSON.stringify(definition)
  useEffect(() => {
    if (!hasRules) return
    let cancelled = false
    const t = setTimeout(async () => {
      const res = await previewSegment(definition)
      if (!cancelled) setPreview({ key: defKey, count: res.count, valid: res.valid })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // defKey captures the whole definition; reading `definition` in the closure is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defKey, hasRules])

  const previewFresh = preview?.key === defKey

  function updateRow(rid: string, patch: Partial<RowState>) {
    setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((rs) => [...rs, { rid: nextRid(), type: 'tag', key: '', op: 'eq', value: '' }])
  }
  function removeRow(rid: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.rid !== rid) : rs))
  }

  function submit() {
    setResult(null)
    start(async () => {
      const res = isEdit
        ? await updateSegment({ id: initial!.id!, name, description, definition })
        : await createSegment({ name, description, definition })
      setResult(res)
      if (res.ok) router.push('/admin/segments')
    })
  }

  const canSave = name.trim().length > 0 && definition.predicates.length > 0 && !pending

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="space-y-1.5">
          <Label htmlFor="seg-name">Name</Label>
          <Input
            id="seg-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Active founders"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="seg-desc">Description</Label>
          <Textarea
            id="seg-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this audience is, and what you use it for."
            rows={2}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-text">Members must match</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setCombinator('all')}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold transition-colors',
                combinator === 'all' ? 'bg-primary text-on-primary' : 'bg-surface text-muted hover:bg-surface-elevated',
              )}
            >
              all
            </button>
            <button
              type="button"
              onClick={() => setCombinator('any')}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold transition-colors',
                combinator === 'any' ? 'bg-primary text-on-primary' : 'bg-surface text-muted hover:bg-surface-elevated',
              )}
            >
              any
            </button>
          </div>
          <span className="text-sm text-muted">of these rules</span>
        </div>

        <div className="space-y-2">
          {rows.map((row) => (
            <PredicateRow
              key={row.rid}
              row={row}
              tags={tags}
              traits={traits}
              traitByKey={traitByKey}
              onChange={(patch) => updateRow(row.rid, patch)}
              onRemove={() => removeRow(row.rid)}
              canRemove={rows.length > 1}
            />
          ))}
        </div>

        <Button type="button" variant="secondary" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4" /> Add rule
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="button" onClick={submit} disabled={!canSave}>
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create segment'}
        </Button>

        <span className="inline-flex items-center gap-1.5 text-sm text-muted">
          <Users className="h-4 w-4 text-subtle" aria-hidden />
          {!hasRules
            ? 'Add a rule to preview the audience'
            : !previewFresh
              ? 'Counting members…'
              : `Matches ${preview!.count.toLocaleString()} member${preview!.count === 1 ? '' : 's'} right now`}
        </span>

        {result?.ok && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        {result && !result.ok && (
          <span className="inline-flex items-center gap-1.5 text-sm text-danger">
            <AlertCircle className="h-4 w-4" /> {result.error}
          </span>
        )}
      </div>
    </div>
  )
}

function PredicateRow({
  row,
  tags,
  traits,
  traitByKey,
  onChange,
  onRemove,
  canRemove,
}: {
  row: RowState
  tags: TraitOption[]
  traits: TraitOption[]
  traitByKey: Map<string, TraitOption>
  onChange: (patch: Partial<RowState>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const keyOptions = row.type === 'tag' ? tags : traits
  const trait = row.type === 'trait' ? traitByKey.get(row.key) : undefined

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-canvas/40 p-2">
      {/* Type: tag membership or a computed trait value */}
      <select
        aria-label="Rule type"
        value={row.type}
        onChange={(e) => onChange({ type: e.target.value as 'tag' | 'trait', key: '' })}
        className={cn(fieldClasses, 'w-auto')}
      >
        <option value="tag">Has tag</option>
        <option value="trait">Trait</option>
      </select>

      {/* Key picker from the registry */}
      <select
        aria-label="Field"
        value={row.key}
        onChange={(e) => {
          const key = e.target.value
          // A boolean trait's control renders "true" by default; seed the row's value so an
          // untouched control persists what the operator sees (was: showed true, saved false).
          const picked = row.type === 'trait' ? traitByKey.get(key) : undefined
          onChange(picked?.type === 'boolean' ? { key, value: 'true' } : { key })
        }}
        className={cn(fieldClasses, 'min-w-40 flex-1')}
      >
        <option value="">Choose one…</option>
        {keyOptions.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Operator + value, traits only */}
      {row.type === 'trait' && row.key && (
        <>
          <select
            aria-label="Comparison"
            value={row.op}
            onChange={(e) => onChange({ op: e.target.value as TraitOp })}
            className={cn(fieldClasses, 'w-auto')}
          >
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ValueControl trait={trait} value={row.value} onChange={(value) => onChange({ value })} />
        </>
      )}

      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label="Remove rule"
        className="ml-auto rounded-lg p-2 text-subtle transition-colors hover:bg-surface-elevated hover:text-danger disabled:opacity-40"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function ValueControl({
  trait,
  value,
  onChange,
}: {
  trait: TraitOption | undefined
  value: string
  onChange: (v: string) => void
}) {
  if (trait?.type === 'boolean') {
    return (
      <select aria-label="Value" value={value || 'true'} onChange={(e) => onChange(e.target.value)} className={cn(fieldClasses, 'w-auto')}>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    )
  }
  if (trait?.type === 'enum' && trait.values?.length) {
    return (
      <select aria-label="Value" value={value} onChange={(e) => onChange(e.target.value)} className={cn(fieldClasses, 'w-auto')}>
        <option value="">Choose…</option>
        {trait.values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    )
  }
  return (
    <Input
      aria-label="Value"
      type={trait?.type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="value"
      className="w-32"
    />
  )
}
