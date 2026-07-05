'use client'

import Link from 'next/link'
import { ArrowUpRight, Plus, X } from 'lucide-react'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import { fieldsForBlock, type BlockStyle, type FieldDef } from '@/lib/entity-blocks/block-content'

// THE INLINE BLOCK EDIT PANEL (ADR-528). Expands under a block in the in-rail builder when the operator
// clicks it. CONTENT blocks get their authored fields (text / link / image / ...); DATA blocks get an
// on/off switch + a couple of quick fields (title / intro) + a link to that feature's own manager. Every
// block gets the STYLE controls (card background, spacing, alignment). Controlled: it holds no state, it
// reads the block's current content/style bag and calls back on every change (the builder applies it to
// the shared store, which repaints + debounce-saves). Semantic DAWN tokens, no hex, voice canon.

const inputCls =
  'w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text placeholder:text-subtle outline-none focus:border-primary'
const labelCls = 'block text-2xs font-semibold uppercase tracking-wide text-subtle'

export function BlockEditPanel({
  id,
  content,
  style,
  hidden,
  editHref,
  onContent,
  onStyle,
  onToggleHide,
}: {
  id: string
  content: Record<string, unknown>
  style: BlockStyle
  hidden: boolean
  /** For a DATA block: the href of that feature's own manager ("Manage Offerings"), or null. */
  editHref: string | null
  onContent: (next: Record<string, unknown>) => void
  onStyle: (next: BlockStyle) => void
  onToggleHide: () => void
}) {
  const block = entityBlockById(id)
  const isData = block?.category === 'data'
  const fields = fieldsForBlock(id)

  const setField = (key: string, value: unknown) => {
    const next = { ...content }
    const empty =
      value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
    if (empty) delete next[key]
    else next[key] = value
    onContent(next)
  }

  return (
    <div className="mt-1 space-y-3 rounded-lg border border-border bg-surface-elevated/50 p-3">
      {/* DATA block: on/off */}
      {isData && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-text">Show on page</span>
          <input
            type="checkbox"
            checked={!hidden}
            onChange={onToggleHide}
            className="h-4 w-4 rounded border-border text-primary focus:ring-border-strong/30"
          />
        </label>
      )}

      {/* Fields */}
      {fields.map((field) => (
        <FieldEditor key={field.key} field={field} value={content[field.key]} onChange={(v) => setField(field.key, v)} />
      ))}

      {/* DATA block: deep-edit link to the feature's own manager */}
      {isData && editHref && (
        <Link
          href={editHref}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong hover:underline"
        >
          Manage {block?.label ?? 'this section'}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}

      {/* Style controls (every block) */}
      <StyleControls style={style} onChange={onStyle} />
    </div>
  )
}

/** One field editor, dispatched by field type. */
function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: FieldDef
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (field.type === 'text' || field.type === 'url') {
    return (
      <label className="block space-y-1">
        <span className={labelCls}>{field.label}</span>
        <input
          type={field.type === 'url' ? 'url' : 'text'}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      </label>
    )
  }
  if (field.type === 'textarea') {
    return (
      <label className="block space-y-1">
        <span className={labelCls}>{field.label}</span>
        <textarea
          rows={3}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      </label>
    )
  }
  if (field.type === 'images') {
    const text = Array.isArray(value) ? (value as unknown[]).filter((v) => typeof v === 'string').join('\n') : ''
    return (
      <label className="block space-y-1">
        <span className={labelCls}>{field.label}</span>
        <textarea
          rows={3}
          value={text}
          placeholder={'One image URL per line'}
          onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
          className={inputCls}
        />
      </label>
    )
  }
  // links
  return <LinksEditor label={field.label} value={value} onChange={onChange} />
}

/** The link-list editor: a row of {label, url} pairs with add / remove. */
function LinksEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: unknown
  onChange: (v: unknown) => void
}) {
  const items: Array<{ label: string; url: string }> = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>).map((it) => ({
        label: typeof it.label === 'string' ? it.label : '',
        url: typeof it.url === 'string' ? it.url : '',
      }))
    : []
  const update = (next: Array<{ label: string; url: string }>) =>
    onChange(next.filter((it) => it.url || it.label))
  return (
    <div className="space-y-1.5">
      <span className={labelCls}>{label}</span>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={it.label}
            placeholder="Label"
            onChange={(e) => update(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            className={`${inputCls} w-1/3`}
          />
          <input
            value={it.url}
            placeholder="https://"
            onChange={(e) => update(items.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
            className={inputCls}
          />
          <button
            type="button"
            aria-label={`Remove link ${i + 1}`}
            onClick={() => update(items.filter((_, j) => j !== i))}
            className="shrink-0 rounded p-1 text-subtle hover:bg-danger-bg hover:text-danger"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => update([...items, { label: '', url: '' }])}
        className="inline-flex items-center gap-1 text-2xs font-semibold text-primary-strong hover:underline"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add link
      </button>
    </div>
  )
}

/** The per-block style controls: background on/off, spacing step, alignment. */
function StyleControls({ style, onChange }: { style: BlockStyle; onChange: (next: BlockStyle) => void }) {
  const set = (patch: Partial<BlockStyle>) => {
    const next: BlockStyle = { ...style, ...patch }
    if (!next.background) delete next.background
    if (next.pad === 'none') delete next.pad
    if (next.align === 'start') delete next.align
    onChange(next)
  }
  return (
    <div className="space-y-2 border-t border-border pt-2.5">
      <span className={labelCls}>Style</span>
      <label className="flex items-center justify-between gap-2">
        <span className="text-xs text-text">Card background</span>
        <input
          type="checkbox"
          checked={style.background === true}
          onChange={(e) => set({ background: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-border-strong/30"
        />
      </label>
      <Segmented
        aria="Spacing"
        options={[
          { v: 'none', label: 'None' },
          { v: 'sm', label: 'S' },
          { v: 'md', label: 'M' },
          { v: 'lg', label: 'L' },
        ]}
        value={style.pad ?? 'none'}
        onSelect={(v) => set({ pad: v as BlockStyle['pad'] })}
      />
      <Segmented
        aria="Alignment"
        options={[
          { v: 'start', label: 'Left' },
          { v: 'center', label: 'Center' },
          { v: 'end', label: 'Right' },
        ]}
        value={style.align ?? 'start'}
        onSelect={(v) => set({ align: v as BlockStyle['align'] })}
      />
    </div>
  )
}

function Segmented({
  aria,
  options,
  value,
  onSelect,
}: {
  aria: string
  options: { v: string; label: string }[]
  value: string
  onSelect: (v: string) => void
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label={aria}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onSelect(o.v)}
          className={`flex-1 px-1.5 py-1 text-2xs font-semibold ${
            value === o.v ? 'bg-primary text-on-primary' : 'bg-surface text-muted hover:bg-surface-elevated'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
