'use client'

import type { ReactNode } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownWideNarrow,
  Ban,
  Columns2,
  Rows2,
  Sparkles,
} from 'lucide-react'
import {
  colorSwatchClass,
  HEIGHT_VALUES,
  type MarginStep,
  type TextColorToken,
} from '@/lib/entity-blocks/block-content'

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
}: {
  ariaLabel: string
  options: readonly SegOption<V>[]
  value: V
  onSelect: (v: V) => void
}) {
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
export function HeightControl({ value, onSelect }: { value: HeightValue; onSelect: (v: HeightValue) => void }) {
  return <Segmented ariaLabel="Height" options={HEIGHT_OPTIONS} value={value} onSelect={onSelect} />
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
