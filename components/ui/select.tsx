import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// The kit's `.input` well with the chevron in a `mu-select` wrapper (ADR-1737); `active` is the soft
// iridescent fill (app/themes/frequency/members-ui.css).

// The Select primitive — a styled NATIVE dropdown for
// toolbar filters, settings and forms. The audit counted ~267 raw `<select>` elements and no
// primitive at all: the largest un-primitived control in the product. This is where that sweep
// lands.
//
// NATIVE, NOT A FAKE. A `<div role="listbox">` would have to re-implement type-ahead, Home/End,
// PageUp/PageDown, the platform picker sheet on iOS/Android, and form submission — and every
// hand-rolled one gets some of that wrong. So the element underneath is a real `<select>`:
// label association (implicit via `Field`, or explicit via `id`/`htmlFor`), `disabled`, `required`,
// `name`, and keyboard behaviour are the browser's, not ours. `appearance-none` removes only the
// UA's arrow so the warm chevron can take its place.
//
// CHROME. It wears the same look as `Input` (`.input`), which means the same CALM,
// NEUTRAL focus halo — a select is a field, and the field ring is the treatment fields get so
// that filling in a form never glows orange. The 3px amber `--color-focus-ring` in
// app/globals.css stays for actionable chrome (buttons, links, checkboxes). One split, two
// treatments, no third.
//
// TONE — the resting palette, and the only axis on which a select departs from the field look.
//
// A census of the raw `<select>` elements left after the Phase 3 sweep found the SAME control
// twice (the CRM contacts roster and the member viewer): a registry-driven facet filter rendered
// as a row of chips, where "this facet is filtering" is said with a border + fill + text swap
// (the `mu-active` fill) against a neutral rest. Both stayed hand-rolled because a call-site tint
// cannot replace a class (cn() is a plain join, not tailwind-merge). This is that prop.
//
// 🔴 TONE IS THE RESTING PALETTE ONLY. It does NOT touch the focus treatment: an active chip
// focuses with the same calm neutral halo as every other field, because the split this file
// documents above (fields get the neutral ring, actionable chrome gets the amber one) is a
// sitewide rule and a filter chip is still a field. One split, two treatments, no third.
//
//   default  the kit field palette.
//   active   this control is currently narrowing the set. Same shape, tinted.
export type SelectTone = 'default' | 'active'

export const selectClasses = 'input'

function selectWithTone(tone: SelectTone): string {
  return tone === 'active' ? 'input mu-active' : 'input'
}

/** An option as a bare string (value === label) or as an explicit value/label pair. */
export type SelectOption =
  | string
  | { value: string | number; label: ReactNode; disabled?: boolean }

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Options to render. Strings become `<option value={s}>{s}</option>`. Omit and pass
   *  `children` instead when you need `<optgroup>` or per-option markup. Both may be used
   *  together; `options` render first. */
  options?: readonly SelectOption[]
  /** Label for a leading `value=""` option — the "no choice yet" / "Any" row that most filter
   *  and optional-field selects need. It is SELECTABLE on purpose (clearing a filter is a real
   *  choice); mark the select `required` if empty must not submit. Named `emptyLabel` rather
   *  than `placeholder` because an unselectable prompt is not what it renders. */
  emptyLabel?: ReactNode
  /** Classes for the positioning wrapper that holds the chevron. The wrapper is `block w-full`
   *  by default (a select in a form fills its field); pass `"inline-block w-max max-w-full"`
   *  for a toolbar filter that should shrink to its widest option.
   *
   *  🔴 NOT `w-auto`, which this docstring recommended until it was measured. `cn()` in this
   *  repo is a plain join, not tailwind-merge, so a class passed here does not REPLACE the
   *  default — both land in the attribute and the cascade settles it by emit order in the
   *  compiled sheet, which no call site can see. Measured against the real compiled
   *  `app/globals.css`: `.w-auto` at 8610 precedes `.w-full` at 8643, so `w-full` wins and the
   *  select stays full width. `.w-max` at 8676 FOLLOWS `w-full`, so it wins, and for a select
   *  `width: max-content` is what "shrink to the widest option" actually means. `max-w-full`
   *  keeps a long option from pushing out of its container. `inline-block` was always fine —
   *  `.block` at 8526 precedes `.inline-block` at 8561.
   *
   *  The same trap applies to any width, padding, or display class routed through here: check
   *  the emit order before assuming your override wins. Type roles DO override (`text-body-sm`
   *  < `text-meta` < `text-2xs`), which is why compact toolbar selects can pass `text-meta`. */
  wrapperClassName?: string
  /** The resting palette. `active` tints a filter chip that is currently narrowing the set. */
  tone?: SelectTone
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, emptyLabel, className, wrapperClassName, children, tone = 'default', ...props },
  ref,
) {
  return (
    <span className={cn('mu-select', tone === 'active' && 'mu-active', wrapperClassName)}>
      <select ref={ref} className={cn(selectWithTone(tone), className)} {...props}>
        {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
        {options?.map((option) => {
          const o = typeof option === 'string' ? { value: option, label: option } : option
          return (
            <option
              key={o.value}
              value={o.value}
              disabled={typeof option === 'string' ? undefined : option.disabled}
            >
              {o.label}
            </option>
          )
        })}
        {children}
      </select>
      {/* Decorative: the control is already named by its label, and the chevron is the arrow the
          UA would have drawn. `pointer-events-none` so the whole box still opens the picker.
          It follows the tone: a quiet arrow beside a tinted, actively-filtering chip reads as a
          leftover from the neutral state, so `active` takes the same foreground as its text. */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </span>
  )
})
