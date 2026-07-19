'use client'

// Per-element LIVE PREVIEWS for the Elements console (docs/EMBEDDABLE-ELEMENTS.md). The console lists +
// configures every registered element; this renders a representative preview of each one right beside its
// settings, so an operator SEES what an element is before tuning it. One preview per element key, keyed the
// same way the component map is — a new element adds a case here (or none, and the panel is simply omitted).
//
// Presentational: previews render the CANONICAL component (PageHero, LoomPicker), never a mock, so the
// gallery can never drift from the real thing. The header preview shows every layout variant at a glance;
// the Loom preview opens the real picker.

import { useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { PageHero } from '@/components/templates'
import { LoomPicker } from '@/components/loom/loom-picker'
import type { ElementKey } from '@/lib/elements/registry'

const HEADER_VARIANTS = [
  { v: 'overlay', label: 'Overlay (centered)' },
  { v: 'identity', label: 'Entity (bottom-left)' },
  { v: 'minimal', label: 'Minimal (cover only)' },
] as const

function HeaderPreview() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {HEADER_VARIANTS.map(({ v, label }) => (
        <div key={v} className="space-y-1.5">
          <p className="text-2xs font-medium uppercase tracking-wide text-subtle">{label}</p>
          <PageHero
            variant={v}
            size="short"
            coverImage={null}
            eyebrow="Section"
            title="Header"
            subtitle={v === 'minimal' ? undefined : 'One band, many layouts.'}
            leading={
              v === 'identity' ? (
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-on-ink/15 text-on-ink">
                  <ImageIcon className="h-5 w-5" />
                </span>
              ) : undefined
            }
          />
        </div>
      ))}
    </div>
  )
}

function LoomPreview() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
      >
        <ImageIcon className="h-4 w-4" /> Open the Loom picker
      </button>
      <LoomPicker open={open} onClose={() => setOpen(false)} title="Loom (preview)" />
    </div>
  )
}

/** The preview body for an element, or null if it has none. */
function previewFor(elementKey: ElementKey): React.ReactNode {
  switch (elementKey) {
    case 'header':
      return <HeaderPreview />
    case 'loom-picker':
      return <LoomPreview />
    default:
      return null
  }
}

/** The labeled preview panel for an element, or null (so the console omits it cleanly). */
export function ElementPreview({ elementKey }: { elementKey: ElementKey }) {
  const body = previewFor(elementKey)
  if (!body) return null
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-elevated/40 p-3">
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Preview</p>
      {body}
    </div>
  )
}
