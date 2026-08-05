import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// The Checkbox primitive (DAWN dawn/components/forms/Checkbox.jsx) — a warm box that fills amber
// with a check when on. Used for consent gates, settings and filter lists, all of which were
// hand-rolling a raw `<input type="checkbox">` with drifting size, colour and label wiring.
//
// NATIVE, NOT A FAKE. DAWN's reference draws a `<button role="checkbox">`; this does not. A real
// `<input type="checkbox">` is what gives us Space to toggle, `disabled`, `required`, form
// submission with `name`/`value`, label click-through, and the browser's own announcement — all
// of which a role-annotated button has to re-implement, and usually only half does. So the input
// IS the visible box: `appearance-none` strips the UA control and the border/fill/radius are set
// on the real element, which means every state (`:checked`, `:disabled`, `:focus-visible`,
// `aria-invalid`) styles itself with no JS mirror to fall out of sync. The check mark is a
// `pointer-events-none` sibling revealed by `peer-checked`.
//
// CONTROLLED THE NATIVE WAY. `checked` + `onChange(event)`, not DAWN's `onChange(nextBoolean)`.
// That keeps it a drop-in for the raw inputs it replaces (no call site has to rewrite its
// handler), keeps `defaultChecked` working uncontrolled, and keeps it usable inside a plain
// `<form>` with a server action.
//
// FOCUS. Deliberately no focus class: the global rule in app/globals.css paints the 3px amber
// `--color-focus-ring` on a focused input, which is the ring actionable chrome gets. A checkbox
// is a control you act on, not a field you type in, so it keeps that ring — the calm neutral
// halo in `fieldClasses` is for text fields, and inventing a third treatment here would break
// the split.
export const checkboxClasses =
  'peer size-5 shrink-0 appearance-none rounded-control border border-border-strong bg-surface transition-[background-color,border-color] motion-reduce:transition-none checked:border-primary checked:bg-primary aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-50'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** The visible label, rendered beside the box and wired by implicit `<label>` association —
   *  no `id` to mint, no `htmlFor` to thread. Omit it only when something else already names
   *  the control (a table column header, a surrounding `<Field>`, an `aria-label`). */
  label?: ReactNode
  /** Helper line under the label. Requires `label`. */
  hint?: ReactNode
  /** Classes for the outer `<label>` (or, unlabelled, for the box wrapper) — for layout, e.g.
   *  `"w-full justify-between"` in a settings row. `className` still goes to the input. */
  wrapperClassName?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, className, wrapperClassName, disabled, ...props },
  ref,
) {
  const labelled = label !== undefined

  // TOUCH TARGET, and why it lands on a different element in each branch. `tap-target` clamps to
  // the active `--tap-min`: 32px density floor on a mouse, 44px on a coarse pointer
  // (app/globals.css). LABELLED, the <label> is the real hit area — clicking anywhere in it
  // toggles the box — so the floor goes there and the box stays a trim 20px beside the text.
  //
  // UNLABELLED it goes on the WRAPPER, not the input. It used to go on the input, and that was
  // wrong in a way nothing would have caught: this input is `appearance-none` with its own
  // border and fill, so it IS the visible box, and a min-block-size floor does not grow a hit
  // area around it — it grows the CHECKBOX. On a coarse pointer that drew a 44px square, and on
  // the kids generations (`--tap-min` up to 56px) a square nearly three times its intended 20px
  // with the tick still frozen at 12px in the middle. The wrapper is an unlabelled <label>, so
  // the floor lands on a real hit area and the box stays 20px inside it. Neither branch bleeds a
  // ::after, which in a stacked list would overlap the next row and toggle the wrong one.
  const Box = labelled ? 'span' : 'label'
  const box = (
    // `relative inline-flex` so the check mark can sit over the input. When unlabelled this is a
    // bare <label> with no text: it names nothing (the caller owns that via aria-label or a
    // surrounding Field) and exists only to be the clickable floor around the box.
    <Box
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        !labelled && 'tap-target',
        !labelled && wrapperClassName,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        disabled={disabled}
        className={cn(checkboxClasses, className)}
        {...props}
      />
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute size-3 text-on-primary opacity-0 transition-opacity peer-checked:opacity-100 motion-reduce:transition-none"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
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
      {/* The fade is applied ONCE, here on the text, because `checkboxClasses` already fades the
          box on `:disabled` — a wrapper-level `opacity-50` would compound the two to 25%. */}
      <span className={cn('min-w-0', disabled && 'opacity-50')}>
        <span className="block text-body-sm text-text">{label}</span>
        {hint ? <span className="mt-0.5 block text-meta text-muted">{hint}</span> : null}
      </span>
    </label>
  )
})
