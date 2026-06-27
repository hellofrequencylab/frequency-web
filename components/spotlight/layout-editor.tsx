'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowUp, ArrowDown, Trash2, Plus, Check, Loader2, ExternalLink } from 'lucide-react'
import {
  type SpotlightBlock,
  type SpotlightLayout,
  BLOCK_PALETTE,
  MAX_BLOCKS,
  SPOTLIGHT_LAYOUT_VERSION,
} from '@/lib/spotlight/blocks/schema'
import { saveSpotlightLayout } from '@/app/(main)/settings/profile/spotlight-actions'

let counter = 0
function newId() {
  counter += 1
  return `b_${Date.now().toString(36)}${counter}`
}

function blankBlock(type: SpotlightBlock['type']): SpotlightBlock {
  const id = newId()
  switch (type) {
    case 'heading': return { id, type, text: '', level: 2 }
    case 'text': return { id, type, text: '' }
    case 'links': return { id, type, items: [{ label: '', url: '' }] }
    case 'image': return { id, type, assetPath: '', alt: '' }
    case 'divider': return { id, type }
  }
}

const inputCls =
  'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder-subtle focus:border-border-strong focus:outline-none'

export function LayoutEditor({ initial, handle }: { initial: SpotlightLayout; handle: string }) {
  const [blocks, setBlocks] = useState<SpotlightBlock[]>(initial.blocks)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function update(id: string, patch: Partial<SpotlightBlock>) {
    setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as SpotlightBlock) : b)))
  }
  function remove(id: string) {
    setBlocks((bs) => bs.filter((b) => b.id !== id))
  }
  function move(id: string, dir: -1 | 1) {
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= bs.length) return bs
      const next = [...bs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function add(type: SpotlightBlock['type']) {
    setBlocks((bs) => (bs.length >= MAX_BLOCKS ? bs : [...bs, blankBlock(type)]))
  }

  function save() {
    setError('')
    start(async () => {
      const res = await saveSpotlightLayout({ version: SPOTLIGHT_LAYOUT_VERSION, blocks })
      if (res?.error) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <div className="space-y-4">
      {blocks.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-surface/50 p-6 text-center text-sm text-muted">
          Your page is empty. Add a block below to start building it.
        </p>
      )}

      {blocks.map((block, i) => (
        <div key={block.id} className="rounded-2xl border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-subtle">{block.type}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(block.id, -1)} disabled={i === 0} className="rounded-md p-1 text-subtle hover:text-text disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => move(block.id, 1)} disabled={i === blocks.length - 1} className="rounded-md p-1 text-subtle hover:text-text disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => remove(block.id)} className="rounded-md p-1 text-subtle hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <BlockFields block={block} onChange={(p) => update(block.id, p)} />
        </div>
      ))}

      {/* Palette */}
      <div className="flex flex-wrap gap-2">
        {BLOCK_PALETTE.filter((p) => p.type !== 'image').map((p) => (
          <button
            key={p.type}
            type="button"
            onClick={() => add(p.type)}
            disabled={blocks.length >= MAX_BLOCKS}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> {p.label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {pending ? 'Saving…' : saved ? 'Saved' : 'Save layout'}
        </button>
        {handle && (
          <Link href={`/spotlight/${handle}`} target="_blank" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Preview
          </Link>
        )}
      </div>
    </div>
  )
}

function BlockFields({ block, onChange }: { block: SpotlightBlock; onChange: (p: Partial<SpotlightBlock>) => void }) {
  if (block.type === 'heading') {
    return (
      <div className="space-y-2">
        <input value={block.text} onChange={(e) => onChange({ text: e.target.value })} placeholder="Heading" className={inputCls} maxLength={80} />
        <select value={block.level} onChange={(e) => onChange({ level: Number(e.target.value) === 3 ? 3 : 2 })} className={`${inputCls} w-auto`}>
          <option value={2}>Large</option>
          <option value={3}>Small</option>
        </select>
      </div>
    )
  }
  if (block.type === 'text') {
    return <textarea value={block.text} onChange={(e) => onChange({ text: e.target.value })} placeholder="Write something…" rows={3} className={`${inputCls} resize-y`} maxLength={1000} />
  }
  if (block.type === 'links') {
    const items = block.items
    return (
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="flex gap-2">
            <input value={it.label} onChange={(e) => onChange({ items: items.map((x, k) => (k === idx ? { ...x, label: e.target.value } : x)) })} placeholder="Label" className={inputCls} maxLength={60} />
            <input value={it.url} onChange={(e) => onChange({ items: items.map((x, k) => (k === idx ? { ...x, url: e.target.value } : x)) })} placeholder="https://…" className={inputCls} />
            {items.length > 1 && (
              <button type="button" onClick={() => onChange({ items: items.filter((_, k) => k !== idx) })} className="shrink-0 rounded-md p-1 text-subtle hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            )}
          </div>
        ))}
        {items.length < 10 && (
          <button type="button" onClick={() => onChange({ items: [...items, { label: '', url: '' }] })} className="text-xs font-medium text-primary-strong hover:underline">+ Add link</button>
        )}
      </div>
    )
  }
  if (block.type === 'divider') {
    return <p className="text-xs text-subtle">A horizontal line.</p>
  }
  return null
}
