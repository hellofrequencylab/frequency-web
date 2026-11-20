'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Star, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { capsLabel } from '@/components/ui/caps-label'
import { asLinkStyle, safeUrl, type LinkStyle } from '@/lib/entity-blocks/block-content'
import { suggestLinkTitle } from '@/lib/spotlight/link-title'
import { useEditorBinding } from '../editor-binding'

// THE LINK ROWS (LIVE-2454). The Links block's editor, shared by every surface that places a Links block (the
// Spotlight, the Space page, the member page). One row per link: the title in full and the address under it,
// so nothing is cut off. A row opens to a full-width title, a full-width address, the link's own style and its
// place in the list. The open row is the shared store's `selectedItemIndex`, so a press on a link in the
// Spotlight preview opens that row here (LIVE-2453). Pasting an address fills a first title (Instagram,
// TikTok, or the site). One link can be the main button, the owner's own pick (owner ruling 2026-11-19).
// Voice canon: no em dashes.

type Item = { label: string; url: string; style?: LinkStyle }

const STYLE_CHOICES: ReadonlyArray<{ value: 'block' | LinkStyle; label: string }> = [
  { value: 'block', label: 'Same as block' },
  { value: 'button', label: 'Button' },
  { value: 'card', label: 'Card' },
  { value: 'text', label: 'Text link' },
]

const labelCls = capsLabel('block text-2xs font-semibold text-muted')

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function readItems(value: unknown): Item[] {
  if (!Array.isArray(value)) return []
  return (value as Array<Record<string, unknown>>).map((it) => {
    const style = asLinkStyle(it.style)
    return {
      label: typeof it.label === 'string' ? it.label : '',
      url: typeof it.url === 'string' ? it.url : '',
      ...(style ? { style } : {}),
    }
  })
}

export function LinksEditor({ label, value, onChange }: { label: string; value: unknown; onChange: (v: unknown) => void }) {
  const items = readItems(value)
  const binding = useEditorBinding()
  const [localOpen, setLocalOpen] = useState<number | null>(null)
  const open = binding ? binding.selectedItemIndex : localOpen
  const setOpen = binding ? binding.selectItem : setLocalOpen
  // Keep blank rows while editing so a new row stays open to type into; the server sanitizer drops a link with
  // no safe address on save.
  const update = (next: Item[]) => onChange(next)
  const patch = (i: number, p: Partial<Item>) => update(items.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const move = (i: number, by: -1 | 1) => {
    const to = i + by
    if (to < 0 || to >= items.length) return
    const next = [...items]
    ;[next[i], next[to]] = [next[to]!, next[i]!]
    update(next)
    if (open === i) setOpen(to)
  }
  const setMain = (i: number, on: boolean) =>
    update(
      items.map((x, j) => {
        if (j === i) return on ? { ...x, style: 'main' as const } : { label: x.label, url: x.url }
        return x.style === 'main' && on ? { label: x.label, url: x.url } : x
      }),
    )
  const onUrl = (i: number, url: string) => {
    const it = items[i]!
    // A title the owner has not touched (blank, or still the one we filled) follows the address.
    const filled = suggestLinkTitle(it.url)
    const title = !it.label || it.label === filled ? suggestLinkTitle(url) || it.label : it.label
    patch(i, { url, label: title })
  }
  const add = () => {
    update([...items, { label: '', url: '' }])
    setOpen(items.length)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={labelCls}>{label}</span>
        <Button type="button" variant="ghost" size="xs" onClick={add}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add link
        </Button>
      </div>
      {items.length === 0 && (
        <p className="rounded-card border border-dashed border-border px-3 py-4 text-center text-meta text-muted">
          No links yet. Press Add link and paste an address.
        </p>
      )}
      <ol className="space-y-1.5">
        {items.map((it, i) => {
          const isOpen = open === i
          const bad = it.url.trim() !== '' && !safeUrl(it.url)
          return (
            <li key={i} className={`rounded-card border bg-surface ${isOpen ? 'border-primary' : 'border-border'}`}>
              <div className="flex items-center gap-1 px-1.5 py-1.5">
                <div className="flex shrink-0 flex-col">
                  <button type="button" aria-label={`Move link ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-0.5 text-subtle hover:text-text disabled:opacity-30">
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button type="button" aria-label={`Move link ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className="rounded p-0.5 text-subtle hover:text-text disabled:opacity-30">
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="min-w-0 flex-1 rounded-control px-1.5 py-1 text-left hover:bg-surface-elevated"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 break-words text-body-sm font-semibold text-text">{it.label || 'Untitled link'}</span>
                    {it.style === 'main' && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-pill bg-primary-bg px-1.5 py-0.5 text-2xs font-semibold text-primary-strong">
                        <Star className="h-3 w-3" aria-hidden /> Main
                      </span>
                    )}
                  </span>
                  <span className={`block truncate text-meta ${bad ? 'text-danger' : 'text-muted'}`}>{it.url ? host(it.url) : 'Add an address'}</span>
                </button>
              </div>
              {isOpen && (
                <div className="space-y-3 border-t border-border px-3 pb-3 pt-2.5">
                  <label className="block space-y-1">
                    <span className={labelCls}>Title</span>
                    <Input className="w-full" value={it.label} placeholder="What the button says" onChange={(e) => patch(i, { label: e.target.value })} />
                  </label>
                  <label className="block space-y-1">
                    <span className={labelCls}>Link</span>
                    <Input
                      className="w-full"
                      value={it.url}
                      type="url"
                      inputMode="url"
                      placeholder="https://"
                      aria-invalid={bad || undefined}
                      onChange={(e) => onUrl(i, e.target.value)}
                    />
                    {bad && <span className="block text-meta text-danger">Start the address with https://</span>}
                  </label>
                  <div className="space-y-1">
                    <span className={labelCls}>Style</span>
                    <SegmentedControl
                      size="xs"
                      label={`Style of link ${i + 1}`}
                      value={it.style && it.style !== 'main' ? it.style : 'block'}
                      onChange={(v) => (v === 'block' ? patch(i, { style: undefined }) : patch(i, { style: v }))}
                      segments={STYLE_CHOICES}
                    />
                  </div>
                  <Checkbox label="Make this the main button" checked={it.style === 'main'} onChange={(e) => setMain(i, e.target.checked)} />
                  <button
                    type="button"
                    onClick={() => {
                      update(items.filter((_, j) => j !== i))
                      setOpen(null)
                    }}
                    className="inline-flex items-center gap-1 text-meta font-semibold text-danger hover:underline"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove link
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
