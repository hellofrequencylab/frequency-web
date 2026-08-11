import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { fieldChromeShape, fieldToneNeutral } from './field'

// The Select primitive (DAWN dawn/components/forms/Select.jsx) — a styled NATIVE dropdown for
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
// CHROME. It wears the same look as `Input` (`fieldChromeClasses`), which means the same CALM,
// NEUTRAL focus halo — a select is a field, and the field ring is the treatment fields get so
// that filling in a form never glows orange. The 3px amber `--color-focus-ring` in
// app/globals.css stays for actionable chrome (buttons, links, checkboxes). One split, two
// treatments, no third.
//
// TOUCH. `tap-target` clamps the control to the active `--tap-min` — 32px density floor on a
// mouse, 44px on a coarse pointer (app/globals.css).
// TONE — the resting palette, and the only axis on which a select departs from the field look.
//
// A census of the raw `<select>` elements left after the Phase 3 sweep found the SAME control
// twice (the CRM contacts roster and the member viewer): a registry-driven facet filter rendered
// as a row of chips, where "this facet is filtering" is said with a border + fill + text swap
// (`border-primary bg-primary-bg text-primary-strong`) against a neutral rest. Both stayed
// hand-rolled, and the ratchet entry says exactly why: "cn() is a plain join rather than
// tailwind-merge, so a tint passed to Select would land beside the primitive's own border-border
// and emit order would decide the winner. They need a tone prop on Select, not a call-site hack."
// This is that prop.
//
// 🔴 TONE IS THE RESTING PALETTE ONLY. It does NOT touch the focus treatment: an active chip
// focuses with the same calm neutral halo as every other field, because the split this file
// documents above (fields get the neutral ring, actionable chrome gets the amber one) is a
// sitewide rule and a filter chip is still a field. One split, two treatments, no third.
//
//   default  the kit field palette. Byte-identical to what every existing Select renders.
//   active   this control is currently narrowing the set. Same shape, tinted.
export type SelectTone = 'default' | 'active'

const SELECT_TONE: Record<SelectTone, string> = {
  default: `${fieldToneNeutral} bg-surface`,
  active: 'border-primary bg-primary-bg text-primary-strong',
}

export const selectClasses = cn(
  fieldChromeShape,
  SELECT_TONE.default,
  // `cursor-pointer` is unconditional: the `disabled:cursor-not-allowed` already in the chrome
  // string is a `:disabled` variant, so it outranks it exactly when it should.
  'tap-target appearance-none py-2 pl-3 pr-9 cursor-pointer',
)

function selectWithTone(tone: SelectTone): string {
  if (tone === 'default') return selectClasses
  return cn(
    fieldChromeShape,
    SELECT_TONE[tone],
    'tap-target appearance-none py-2 pl-3 pr-9 cursor-pointer',
  )
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
    <span className={cn('relative block w-full', wrapperClassName)}>
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
        className={cn(
          'pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2',
          tone === 'active' ? 'text-primary-strong' : 'text-subtle',
        )}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </span>
  )
})
