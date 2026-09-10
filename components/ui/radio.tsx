import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// The Radio primitive — the missing twin of Checkbox (components/ui/checkbox.tsx). A warm ring that
// fills amber with a dot when chosen.
//
// WHY IT DID NOT EXIST UNTIL NOW, which is the useful part. The kit has had a Checkbox since the
// Phase 3 field sweep, and the `raw-input` adoption ratchet has been counting hand-rolled inputs
// ever since — but eight surfaces were hand-rolling a raw radio input with drifting size,
// colour and label wiring, and there was no primitive to sweep them onto. A ratchet whose zero is
// unreachable stops being a ladder and becomes a tax, and the honest way down was to build the
// missing rung rather than to raise the baseline.
//
// NATIVE, NOT A FAKE, for exactly the reasons Checkbox states and one more that is specific to
// radios: a native radio group gives ARROW-KEY ROVING for free. A group of buttons
// with `role="radio"` has to implement roving tabindex, Home/End and wrap-around by hand, and a
// group of buttons with `aria-pressed` says something different from what a radio group means
// (several toggles that happen to be adjacent, rather than one choice among many). So the input IS
// the visible ring: `appearance-none` strips the UA control and the border, fill and radius are set
// on the real element, so every state (`:checked`, `:disabled`, `:focus-visible`, `aria-invalid`)
// styles itself with no JS mirror to fall out of sync. The dot is a `pointer-events-none` sibling
// revealed by `peer-checked`.
//
// CONTROLLED THE NATIVE WAY, like Checkbox: `checked` + `onChange(event)`, so it is a drop-in for
// the raw inputs it replaces, `defaultChecked` still works uncontrolled, and it still submits inside
// a plain `<form>` with a server action.
//
// FOCUS. No focus class here either: the global rule in app/globals.css paints the 3px amber
// `--color-focus-ring` on a focused input. A radio is a control you act on, not a field you type in,
// so it keeps that ring — the calm neutral halo in `fieldClasses` is for text fields.
//
// 🔴 THE `name` IS WHAT MAKES A GROUP A GROUP. Two radios sharing a name are mutually exclusive
// and arrow-navigable; two without one are two independent controls that look like a group and
// behave like nothing. It is therefore NOT optional here, even though the DOM would accept it.
export const radioClasses =
  'peer size-5 shrink-0 appearance-none rounded-full border border-border-strong bg-surface transition-[background-color,border-color] motion-reduce:transition-none checked:border-primary checked:bg-primary aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-50'

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'name'> {
  /** The group this choice belongs to. Required — see the note above. */
  name: string
  /** The visible label, rendered beside the ring and wired by implicit `<label>` association —
   *  no `id` to mint, no `htmlFor` to thread. Omit it only when something else already names the
   *  control (a table column header, a surrounding `<Field>`, an `aria-label`). */
  label?: ReactNode
  /** Helper line under the label. Requires `label`. */
  hint?: ReactNode
  /** Classes for the outer `<label>` (or, unlabelled, for the ring wrapper) — for layout, e.g.
   *  `"w-full justify-between"` in a settings row. `className` still goes to the input. */
  wrapperClassName?: string
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, hint, className, wrapperClassName, disabled, ...props },
  ref,
) {
  const labelled = label !== undefined

  // TOUCH TARGET, on the same split Checkbox uses and for the same measured reason: LABELLED, the
  // <label> is the real hit area, so the floor goes there and the ring stays a trim 20px beside the
  // text. UNLABELLED it goes on the WRAPPER and never on the input — this input is
  // `appearance-none` with its own border and fill, so it IS the visible ring, and a min-block-size
  // floor would grow the RING rather than a hit area around it (44px on a coarse pointer, more on
  // the kids generations, with the dot still frozen in the middle).
  const Box = labelled ? 'span' : 'label'
  const box = (
    <Box
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        !labelled && 'tap-target',
        !labelled && wrapperClassName,
      )}
    >
      <input
        ref={ref}
        type="radio"
        disabled={disabled}
        className={cn(radioClasses, className)}
        {...props}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute size-2 rounded-full bg-on-primary opacity-0 transition-opacity peer-checked:opacity-100 motion-reduce:transition-none"
      />
    </Box>
  )

  if (!labelled) return box

  return (
    <label
      className={cn(
        'tap-target inline-flex gap-2.5',
        hint ? 'items-start' : 'items-center',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        wrapperClassName,
      )}
    >
      {box}
      {/* The fade is applied ONCE, here on the text, because `radioClasses` already fades the ring
          on `:disabled` — a wrapper-level `opacity-50` would compound the two to 25%. */}
      <span className={cn('min-w-0', disabled && 'opacity-50')}>
        <span className="block text-body-sm text-text">{label}</span>
        {hint ? <span className="mt-0.5 block text-meta text-muted">{hint}</span> : null}
      </span>
    </label>
  )
})
