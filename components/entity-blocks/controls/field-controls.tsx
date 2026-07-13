'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownWideNarrow,
  ArrowUpRight,
  Ban,
  Check,
  Columns2,
  Plus,
  Rows2,
  Sparkles,
  X,
} from 'lucide-react'
import {
  colorSwatchClass,
  HEIGHT_VALUES,
  type MarginStep,
  type TextColorToken,
} from '@/lib/entity-blocks/block-content'
import { searchEmoji, searchLucide } from '@/lib/entity-blocks/icon-tokens'
import { BlockIcon } from '@/components/entity-blocks/block-icon'

// THE REUSABLE INSPECTOR CONTROL PRIMITIVES (ADR-569 C6). A tight, modern, Framer/Webflow/Notion-style set
// of controls the block editor composes — and that a FEATURE agent attaches to a block by DECLARING a field,
// never by writing bespoke panel JSX. Every control is:
//   • TOKEN-DRIVEN — semantic DAWN classes only, no hardcoded hex (the color picker drives off the design
//     tokens + the Space accent; it never exposes a raw hex that would break theming).
//   • COMPACT — segmented / icon-button density, minimal vertical footprint, so the panel reads like a real
//     inspector, not a stack of labelled dropdowns.
//   • A11Y-CORRECT — icon-only buttons carry an accessible name (aria-label + title); segmented groups use
//     role="group" + aria-pressed; the whole set is keyboard-operable.
// Controlled + stateless: each holds no state, reads its current value, and calls back on change. Voice canon
// (no em dashes) on every visible label.

// ── Shared shells ───────────────────────────────────────────────────────────────────────────────────────

/** A control ROW: a small uppercase label on the left, the control on the right. The panel's atom of
 *  vertical rhythm — one line per control keeps the inspector dense. */
export function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-2xs font-semibold uppercase tracking-wide text-subtle">{label}</span>
      <div className="flex min-w-0 items-center justify-end">{children}</div>
    </div>
  )
}

/** A collapsible GROUP of controls under a disclosure summary. Closed by default so the panel leads with
 *  content and the look controls are one tap away. */
export function ControlGroup({
  label,
  defaultOpen = false,
  children,
}: {
  label: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details
      open={defaultOpen}
      className="border-t border-border pt-2 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="cursor-pointer select-none text-2xs font-semibold uppercase tracking-wide text-subtle">
        {label}
      </summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  )
}

/** A control STACK: the label ABOVE a full-width control (items 5/6/7). The one-line ControlRow squeezes a
 *  wide segmented until its options clip; stacking gives the control the whole panel width so a Shape /
 *  Content / Height picker with several word-options reads in full. Used for the text-option segmented
 *  controls; the compact icon-groups (align / shadow / orientation / color) stay on a single ControlRow. */
export function ControlStack({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-2xs font-semibold uppercase tracking-wide text-subtle">{label}</span>
      <div>{children}</div>
    </div>
  )
}

// ── Segmented + icon-group (the core inline pattern) ────────────────────────────────────────────────────

export interface SegOption<V extends string> {
  value: V
  /** The accessible name (title + aria-label when icon-only; the visible text otherwise). */
  label: string
  /** Optional icon; when present the button is icon-only (label goes to the accessible name). */
  icon?: ReactNode
}

/** The compact SEGMENTED control (ADR-569 C6): a single-select bar of equal buttons. Text or icon options;
 *  icon options become icon-buttons with the label as their accessible name. The base of the alignment,
 *  height, orientation, margin, and generic-segmented controls. */
export function Segmented<V extends string>({
  ariaLabel,
  options,
  value,
  onSelect,
  wrap = false,
}: {
  ariaLabel: string
  options: readonly SegOption<V>[]
  value: V
  onSelect: (v: V) => void
  /** WRAP mode (items 5/6/7): render the options as individual pills that wrap to the next line instead of a
   *  single fixed bar, so a several-word set (Shape, Content, Height) never clips in a narrow rail. Pair with
   *  ControlStack (label above, full width). */
  wrap?: boolean
}) {
  if (wrap) {
    return (
      <div className="flex flex-wrap gap-1" role="group" aria-label={ariaLabel}>
        {options.map((o) => {
          const on = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              aria-label={o.icon ? o.label : undefined}
              title={o.label}
              onClick={() => onSelect(o.value)}
              className={`flex min-h-[26px] items-center justify-center gap-1 rounded-md border px-2.5 py-1 text-2xs font-semibold transition-colors ${
                on
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border bg-surface text-muted hover:bg-surface-elevated hover:text-text'
              }`}
            >
              {o.icon ?? o.label}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            aria-label={o.icon ? o.label : undefined}
            title={o.label}
            onClick={() => onSelect(o.value)}
            className={`flex min-h-[26px] items-center justify-center gap-1 px-2 py-1 text-2xs font-semibold transition-colors ${
              o.icon ? 'w-8' : 'flex-1'
            } ${on ? 'bg-primary text-on-primary' : 'bg-surface text-muted hover:bg-surface-elevated hover:text-text'}`}
          >
            {o.icon ?? o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Minimal toggle (ADR-569 C6) ─────────────────────────────────────────────────────────────────────────

/** A minimal on/off SWITCH: a pill track + thumb, not a checkbox. Replaces the verbose labelled checkboxes
 *  in the old panel. Compact + a11y-correct (role="switch", aria-checked, keyboard-operable as a button). */
export function Toggle({
  ariaLabel,
  checked,
  onChange,
  disabled = false,
}: {
  ariaLabel: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-primary' : 'bg-border-strong/50'
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-3 w-3 transform rounded-full bg-surface shadow-sm transition-transform ${
          checked ? 'translate-x-3.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

/** A labelled toggle ROW (the common case): the minimal switch on a control row. */
export function ToggleRow({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <ControlRow label={label}>
      <Toggle ariaLabel={label} checked={checked} onChange={onChange} disabled={disabled} />
    </ControlRow>
  )
}

// ── Alignment (Left | Center | Right) icon-group (C1/C6) ────────────────────────────────────────────────

export type AlignValue = 'start' | 'center' | 'end'

const ALIGN_OPTIONS: readonly SegOption<AlignValue>[] = [
  { value: 'start', label: 'Left', icon: <AlignLeft className="h-3.5 w-3.5" aria-hidden /> },
  { value: 'center', label: 'Center', icon: <AlignCenter className="h-3.5 w-3.5" aria-hidden /> },
  { value: 'end', label: 'Right', icon: <AlignRight className="h-3.5 w-3.5" aria-hidden /> },
]

/** The ALIGNMENT icon-group (ADR-569 C6): Left | Center | Right, each an icon-button. */
export function AlignControl({ value, onSelect }: { value: AlignValue; onSelect: (v: AlignValue) => void }) {
  return <Segmented ariaLabel="Alignment" options={ALIGN_OPTIONS} value={value} onSelect={onSelect} />
}

// ── Height (Short | Medium | Tall) 3-way selector (C6) ──────────────────────────────────────────────────

export type HeightValue = (typeof HEIGHT_VALUES)[number]

const HEIGHT_OPTIONS: readonly SegOption<HeightValue>[] = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'tall', label: 'Tall' },
]

/** The 3-way HEIGHT selector (ADR-569 C6): Short | Medium | Tall. A feature agent attaches it via a `height`
 *  field; the hero / media blocks will read the value to size themselves. */
export function HeightControl({
  value,
  onSelect,
  wrap = false,
}: {
  value: HeightValue
  onSelect: (v: HeightValue) => void
  wrap?: boolean
}) {
  return <Segmented ariaLabel="Height" options={HEIGHT_OPTIONS} value={value} onSelect={onSelect} wrap={wrap} />
}

// ── Button orientation (Row | Stacked) selector (C6) ────────────────────────────────────────────────────

export type ButtonOrientationValue = 'row' | 'stacked'

const ORIENTATION_OPTIONS: readonly SegOption<ButtonOrientationValue>[] = [
  { value: 'row', label: 'Side by side', icon: <Columns2 className="h-3.5 w-3.5" aria-hidden /> },
  { value: 'stacked', label: 'Stacked', icon: <Rows2 className="h-3.5 w-3.5" aria-hidden /> },
]

/** The BUTTON-ORIENTATION selector (ADR-569 C6): lay a block's buttons side by side or stacked. */
export function ButtonOrientationControl({
  value,
  onSelect,
}: {
  value: ButtonOrientationValue
  onSelect: (v: ButtonOrientationValue) => void
}) {
  return <Segmented ariaLabel="Button layout" options={ORIENTATION_OPTIONS} value={value} onSelect={onSelect} />
}

// ── Margin control (C3) ─────────────────────────────────────────────────────────────────────────────────

const MARGIN_OPTIONS: readonly SegOption<MarginStep>[] = [
  { value: 'none', label: 'None' },
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
  { value: 'xl', label: 'XL' },
]

/** The compact per-block/per-row MARGIN control (ADR-569 C3): a segmented top + bottom spacing pick. Two
 *  short rows keep it dense; the values are token-driven steps (marginTopClass / marginBottomClass). */
export function MarginControl({
  top,
  bottom,
  onTop,
  onBottom,
}: {
  top: MarginStep
  bottom: MarginStep
  onTop: (v: MarginStep) => void
  onBottom: (v: MarginStep) => void
}) {
  return (
    <div className="space-y-1.5">
      <ControlRow label="Space above">
        <Segmented ariaLabel="Space above" options={MARGIN_OPTIONS} value={top} onSelect={onTop} />
      </ControlRow>
      <ControlRow label="Space below">
        <Segmented ariaLabel="Space below" options={MARGIN_OPTIONS} value={bottom} onSelect={onBottom} />
      </ControlRow>
    </div>
  )
}

// ── Color swatch picker (C1/C6) ─────────────────────────────────────────────────────────────────────────

const COLOR_OPTIONS: readonly { value: TextColorToken; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'muted', label: 'Muted' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'accent', label: 'Accent' },
  { value: 'success', label: 'Success' },
  { value: 'info', label: 'Info' },
  { value: 'danger', label: 'Alert' },
]

/** The token/accent COLOR swatch picker (ADR-569 C1/C6). A row of swatches driven by the DESIGN TOKENS + the
 *  Space accent — never a raw hex, so a pick can never break theming. `accent` re-skins with the Space's
 *  primary. A ring marks the active swatch; each swatch carries its token name as its accessible label. */
export function ColorControl({
  value,
  onSelect,
}: {
  value: TextColorToken
  onSelect: (v: TextColorToken) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Text color">
      {COLOR_OPTIONS.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            aria-label={o.label}
            title={o.label}
            onClick={() => onSelect(o.value)}
            className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${colorSwatchClass(o.value)} ${
              on ? 'border-text ring-2 ring-primary ring-offset-1 ring-offset-surface' : 'border-border'
            }`}
          />
        )
      })}
    </div>
  )
}

// ── Shadow control (on/off + preset, C1/C6) ─────────────────────────────────────────────────────────────

export type ShadowValue = 'none' | 'soft' | 'strong'

const SHADOW_OPTIONS: readonly SegOption<ShadowValue>[] = [
  { value: 'none', label: 'None', icon: <Ban className="h-3.5 w-3.5" aria-hidden /> },
  { value: 'soft', label: 'Soft', icon: <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden /> },
  { value: 'strong', label: 'Strong', icon: <Sparkles className="h-3.5 w-3.5" aria-hidden /> },
]

/** The SHADOW control (ADR-569 C1/C6): off, a soft lift, or a strong pop. Presets only (token-driven text
 *  shadow), so it stays theming-safe and never exposes a raw shadow string. */
export function ShadowControl({ value, onSelect }: { value: ShadowValue; onSelect: (v: ShadowValue) => void }) {
  return <Segmented ariaLabel="Shadow" options={SHADOW_OPTIONS} value={value} onSelect={onSelect} />
}

// ── Data-source picker (ADR-573, item 5) ──────────────────────────────────────────────────────────────────

/** One choice a data-source picker offers: a stable `id`, the human `label`, and an optional deep link to
 *  that one item's live page (an event / a circle). Mirrors BlockDataItem, kept local so this client control
 *  never imports the server-only data registry. */
export interface PickerItem {
  id: string
  label: string
  href?: string
}

/** One function-backed block's serializable picker payload (ADR-573, item 5): the Space's live items + the
 *  admin create link the editor shows when the list is empty. This is the CLIENT-safe mirror of the server
 *  `BlockPickerData` (lib/entity-blocks/block-data-sources.ts), declared here so the client builder + edit
 *  panel can type the seed without importing the server-only data registry. */
export interface BlockPickerData {
  items: PickerItem[]
  createHref: string
  createLabel: string
}

/** The function-aware DATA-SOURCE picker (ADR-573, item 5). A multi-select checklist of the Space's OWN live
 *  items for a function-backed block (which offerings / events / team the section features). Its options are
 *  the Space's REAL data, resolved server-side and passed in — not a fixed enum. Behaviour:
 *   • The stored value is the SELECTED ids; NOTHING selected means "show every item" (item 7), so the empty
 *     state reads "Showing all", not a broken picker.
 *   • When the function has NO items yet, the control shows a single "Create ..." LINK to the admin page
 *     (createHref) instead of an empty list, so the operator has one clear next step.
 *  Controlled + stateless; token-driven; a11y (role="group", aria-pressed per row, keyboard-operable
 *  buttons). Voice canon on every visible label (no em dashes). */
export function PickerControl({
  label,
  items,
  selected,
  createHref,
  createLabel,
  onChange,
}: {
  label: string
  /** The Space's live items for this block (may be empty). */
  items: readonly PickerItem[]
  /** The currently selected item ids (empty === show all). */
  selected: readonly string[]
  /** The admin route to create the first item (shown when `items` is empty). */
  createHref?: string | null
  /** The "Create ..." link copy (e.g. "Create an offering"). */
  createLabel?: string
  /** Called with the next selection; an empty array means "show all". */
  onChange: (next: string[]) => void
}) {
  // Empty function: one honest next step, not a dead list (item 5's create-link empty state).
  if (items.length === 0) {
    return (
      <div className="space-y-1.5">
        <span className="block text-2xs font-semibold uppercase tracking-wide text-subtle">{label}</span>
        {createHref ? (
          <Link
            href={createHref}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-2 text-xs font-semibold text-primary-strong transition-colors hover:border-primary"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> {createLabel ?? 'Create the first one'}
          </Link>
        ) : (
          <p className="text-2xs text-subtle">Nothing to feature here yet.</p>
        )}
      </div>
    )
  }

  const chosen = new Set(selected)
  const toggle = (id: string) => {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    // Preserve the items' natural order; an all-selected / none-selected result both collapse to [] (show all).
    const ids = items.map((it) => it.id).filter((x) => next.has(x))
    onChange(ids.length === items.length ? [] : ids)
  }

  const showingAll = chosen.size === 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">{label}</span>
        <span className="text-3xs text-subtle">{showingAll ? 'Showing all' : `${chosen.size} chosen`}</span>
      </div>
      <ul className="space-y-1" role="group" aria-label={label}>
        {items.map((it) => {
          const on = chosen.has(it.id)
          return (
            <li key={it.id} className="flex items-center gap-1.5">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(it.id)}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                  on
                    ? 'border-primary bg-primary-bg text-text'
                    : 'border-border bg-surface text-muted hover:border-border-strong hover:text-text'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    on ? 'border-primary bg-primary text-on-primary' : 'border-border-strong'
                  }`}
                >
                  {on && <Check className="h-3 w-3" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
              </button>
              {it.href && (
                <Link
                  href={it.href}
                  aria-label={`Open ${it.label}`}
                  className="shrink-0 rounded p-1 text-subtle hover:text-text"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-3xs text-subtle">
        {showingAll ? 'Every one shows. Tap to feature only some.' : 'Only the ones you tap show. Tap all to clear.'}
      </p>
    </div>
  )
}

// ── Icon picker (site icons + emoji, both searchable) — email overhaul item 4 ─────────────────────────────

/** The searchable ICON PICKER (email overhaul, 2026). Replaces the plain "Icon or emoji" text box with a
 *  popover offering TWO searchable sources: curated Lucide SITE ICONS and a bundled EMOJI set. Whichever the
 *  operator picks, it stores the SAME short token the renderer reads (a Lucide name, or an emoji char). A
 *  trigger button shows the current pick (or a placeholder); the popover has a source toggle, a search box, a
 *  result grid, and a Clear. Controlled + a11y (buttons, aria-pressed, labelled); token-driven; voice canon. */
export function IconPicker({
  value,
  onChange,
  ariaLabel = 'Icon',
}: {
  value: string
  onChange: (token: string) => void
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<'icon' | 'emoji'>('icon')
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const lucideResults = useMemo(() => (source === 'icon' ? searchLucide(query) : []), [source, query])
  const emojiResults = useMemo(() => (source === 'emoji' ? searchEmoji(query) : []), [source, query])

  const pick = (token: string) => {
    onChange(token)
    setOpen(false)
    setQuery('')
  }

  const tabCls = (on: boolean) =>
    `flex-1 rounded-md px-2 py-1 text-2xs font-semibold transition-colors ${
      on ? 'bg-primary text-on-primary' : 'bg-surface text-muted hover:bg-surface-elevated hover:text-text'
    }`

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger: shows the current icon (or a placeholder), opens the popover. */}
      <button
        type="button"
        aria-label={value ? `${ariaLabel}: change` : `${ariaLabel}: choose`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text transition-colors hover:border-border-strong"
      >
        {value ? <BlockIcon name={value} size={20} /> : <Plus className="h-4 w-4 text-subtle" aria-hidden />}
      </button>

      {open && (
        <>
          {/* Click-catcher: closes the popover when the operator clicks away. */}
          <button
            type="button"
            aria-label="Close icon picker"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label={`Choose ${ariaLabel.toLowerCase()}`}
            className="absolute left-0 top-10 z-50 w-64 space-y-2 rounded-xl border border-border bg-surface p-2 shadow-lg"
          >
            <div className="flex items-center gap-1">
              <button type="button" aria-pressed={source === 'icon'} className={tabCls(source === 'icon')} onClick={() => setSource('icon')}>
                Icons
              </button>
              <button type="button" aria-pressed={source === 'emoji'} className={tabCls(source === 'emoji')} onClick={() => setSource('emoji')}>
                Emoji
              </button>
              {value && (
                <button
                  type="button"
                  aria-label="Clear icon"
                  onClick={() => pick('')}
                  className="rounded-md p-1 text-subtle hover:bg-danger-bg hover:text-danger"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>

            <input
              type="text"
              value={query}
              placeholder={source === 'icon' ? 'Search icons' : 'Search emoji'}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text placeholder:text-subtle outline-none focus:border-primary"
              autoFocus
            />

            <div className="grid max-h-48 grid-cols-6 gap-1 overflow-y-auto">
              {source === 'icon'
                ? lucideResults.map((i) => (
                    <button
                      key={i.name}
                      type="button"
                      aria-label={i.name}
                      title={i.name}
                      onClick={() => pick(i.name)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-surface-elevated ${
                        value === i.name ? 'border-primary bg-primary-bg text-primary-strong' : 'border-transparent text-text'
                      }`}
                    >
                      <BlockIcon name={i.name} size={18} />
                    </button>
                  ))
                : emojiResults.map((e) => (
                    <button
                      key={e.char}
                      type="button"
                      aria-label={e.keywords.split(' ')[0]}
                      title={e.keywords.split(' ')[0]}
                      onClick={() => pick(e.char)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md border text-lg leading-none transition-colors hover:bg-surface-elevated ${
                        value === e.char ? 'border-primary bg-primary-bg' : 'border-transparent'
                      }`}
                    >
                      {e.char}
                    </button>
                  ))}
              {((source === 'icon' && lucideResults.length === 0) || (source === 'emoji' && emojiResults.length === 0)) && (
                <p className="col-span-6 py-3 text-center text-2xs text-subtle">No matches. Try another word.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
