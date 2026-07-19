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
import { ImageIcon, Building2, User, Compass, ArrowDownUp } from 'lucide-react'
import { PageHero, type PageHeroVariant, type PageHeroSize, type HeroOverlayStyle } from '@/components/templates'
import { LoomPicker } from '@/components/loom/loom-picker'
import { StyleEditor } from '@/app/(main)/admin/qr/style-editor'
import { DEFAULT_STYLE, type QrStyle } from '@/lib/qr/style'
import type { ElementKey } from '@/lib/elements/registry'

// The header element's SECTION PRESETS: each real surface header shares the one PageHero base but has
// its own unique feature set. The console shows them as a see-and-sort gallery (owner ask) so an
// operator can browse every header style with its distinctive features called out. Each preview renders
// the CANONICAL PageHero (never a mock), so the gallery can't drift from the live headers.
interface HeaderPreset {
  key: string
  name: string
  /** The base layout it rides (also the secondary sort key). */
  type: string
  variant: PageHeroVariant
  size: PageHeroSize
  /** The overlay treatment this header ships (so the gallery demonstrates all three styles). */
  overlayStyle: HeroOverlayStyle
  eyebrow?: React.ReactNode
  title: string
  subtitle?: string
  leading?: React.ReactNode
  search?: boolean
  /** What is distinctive about THIS preset (vs the shared base). */
  features: string[]
}

const HEADER_PRESETS: HeaderPreset[] = [
  {
    key: 'space', name: 'Space', type: 'Identity', variant: 'identity', size: 'short', overlayStyle: 'shadow',
    eyebrow: 'Business', title: 'River Yoga', subtitle: 'Slow, breath-led yoga by the river.',
    leading: <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-on-ink/15 text-on-ink"><Building2 className="h-5 w-5" /></span>,
    features: ['Logo chip', 'Follow + Book CTA', 'Shadow overlay'],
  },
  {
    key: 'profile', name: 'Profile', type: 'Identity', variant: 'identity', size: 'short', overlayStyle: 'none',
    eyebrow: <span className="rounded bg-on-ink/15 px-1.5 py-0.5 text-2xs text-on-ink">Janitor</span>,
    title: 'Daniel Tyack', subtitle: '@danieltyack',
    leading: <span className="flex h-9 w-9 items-center justify-center rounded-full bg-on-ink/15 text-on-ink ring-2 ring-on-ink/30"><User className="h-5 w-5" /></span>,
    features: ['Round avatar', 'Role badge', 'No overlay', 'QR & Share'],
  },
  {
    key: 'journey', name: 'Journey', type: 'Identity', variant: 'identity', size: 'short', overlayStyle: 'shadow',
    eyebrow: 'Journey', title: 'The 28-Day Reset', subtitle: 'Build a steadier, quieter week.',
    leading: <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-canvas/90 text-primary shadow ring-1 ring-on-ink/10"><Compass className="h-5 w-5" /></span>,
    features: ['Accent icon chip', 'Admin action row', 'Shadow overlay', 'QR & Share'],
  },
  {
    key: 'market', name: 'Marketplace', type: 'Overlay', variant: 'overlay', size: 'short', overlayStyle: 'fade',
    eyebrow: 'Marketplace', title: 'Find your people', subtitle: 'Browse local offerings.', search: true,
    features: ['Centered', 'In-hero search', 'Fade overlay'],
  },
]

type HeaderSort = 'name' | 'type'

function HeaderPreview() {
  const [sort, setSort] = useState<HeaderSort>('name')
  const presets = [...HEADER_PRESETS].sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
  )
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ArrowDownUp className="h-3.5 w-3.5 text-subtle" aria-hidden />
        <span className="text-2xs uppercase tracking-wide text-subtle">Sort</span>
        {(['name', 'type'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSort(s)}
            className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize transition-colors ${sort === s ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-elevated'}`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {presets.map((p) => (
          <div key={p.key} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text">{p.name}</p>
              <span className="text-2xs uppercase tracking-wide text-subtle">{p.type}</span>
            </div>
            <PageHero
              variant={p.variant}
              size={p.size}
              overlayStyle={p.overlayStyle}
              coverImage={null}
              eyebrow={p.eyebrow}
              title={p.title}
              subtitle={p.subtitle}
              leading={p.leading}
              search={p.search ? <div className="rounded-full bg-canvas/90 px-3 py-1.5 text-xs text-muted">Search…</div> : undefined}
            />
            <div className="flex flex-wrap gap-1">
              {p.features.map((f) => (
                <span key={f} className="rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-muted">{f}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
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

function QrPreview() {
  const [style, setStyle] = useState<QrStyle>(DEFAULT_STYLE)
  return (
    <StyleEditor
      value={style}
      onChange={setStyle}
      previewUrl="https://frequencylocal.com/q/preview"
      variant="inline"
    />
  )
}

/** The preview body for an element, or null if it has none. */
function previewFor(elementKey: ElementKey): React.ReactNode {
  switch (elementKey) {
    case 'header':
      return <HeaderPreview />
    case 'loom-picker':
      return <LoomPreview />
    case 'qr-studio':
      return <QrPreview />
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
