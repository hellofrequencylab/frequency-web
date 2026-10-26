import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type LabelHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// A boxed field is the members kit's `.input` (ADR-1737; 48px, a 4% ink well, 16px radius, the focus
// ring), Field is the kit's `.field` column, and the label, hint and error are `mu-label` / `mu-hint` /
// `mu-err` (app/themes/frequency/members-ui.css). The kit's well reads on every surface, so the
// `surface` prop is accepted and ignored. Seamless stays seamless.

// Shared form-field styling + primitives — one source of truth for inputs,
// textareas, selects, and labels (the audit found this class string copy-pasted
// across ~40 files). Use the components for new code; `fieldClasses` is for the
// element a component can't wrap directly (e.g. a native <select>). The focus look
// is the calm, neutral halo standardized in the sitewide focus sweep — never the
// amber :focus-visible ring (this wins by specificity).

// State set per docs/INTERACTION-STATES.md §2 (Field): rest · focus-visible · error · disabled. The
// kit's `.input` carries all four, keyed off the control's own `aria-invalid` / `:disabled`.
// `fieldChromeClasses` is the field LOOK with no padding of its own; `fieldClasses` is the same look
// for an element a component cannot wrap directly (e.g. a native <select>).
export const fieldChromeClasses = 'input'

export const fieldClasses = 'input'

/**
 * Which surface a field's fill sits on. Callers still pass it (`inset` for a field inside a
 * `bg-surface` card), but the kit's `.input` well reads on every surface, so it changes nothing.
 */
export type FieldSurface = 'default' | 'post' | 'inset'

/**
 * How much chrome the field draws around itself.
 *
 *   boxed     the kit default: border, radius, fill, `px-3 py-2`, the calm focus halo.
 *   seamless  NO chrome at all. The field is a fragment of a control that is already a box —
 *             a search band with its own border and icon, a tag-chip row, an inline title on a
 *             card, a composer inside a bordered compose card. The container owns the border,
 *             the radius, the fill and the padding; the input contributes only text.
 *
 * 🔴 WHY THIS IS A VARIANT AND NOT A CLASSNAME. It is the same plain-join trap the surface prop
 * documents, four times over: a seamless call site would have to beat `border`, `rounded-control`,
 * `bg-surface` AND `px-3 py-2`, and `cn` does not remove them — all eight utilities land in the
 * attribute and Tailwind's emit order picks the winner. Measured in the compiled sheet,
 * `bg-transparent` (91516) does follow `bg-surface` (88180) and would win, but `px-3`/`py-2`
 * (115980 / 116820) have nothing after them to lose to, so a borderless composer would still
 * render with the boxed field's inset padding. That is why ~45 borderless inputs and 6 borderless
 * textareas stayed hand-rolled: not one of them could be expressed as `<Input className="…" />`.
 *
 * 🔴 WHAT SEAMLESS DELIBERATELY DOES NOT OWN: the type role and the text colour. A seamless field
 * takes the VOICE of the band it sits in — a composer is `text-body-sm`, an inline listing title is
 * `text-page-title font-bold`, a secondary summary line is `text-muted` — and the call site states
 * it, exactly as those sites already do. Baking `text-body-sm text-text` in here would not be a
 * default, it would be an override: `text-text` (138565) is emitted after `text-muted` (132206),
 * so the base string would silently repaint every quiet subtitle field at full strength.
 *
 * FOCUS IS NOT LOST. `app/globals.css` rings `:where(input, textarea):focus-visible` from an
 * UNLAYERED rule, which outranks every utility in `@layer`, so a seamless field keeps the neutral
 * focus halo that the Field class requires (docs/INTERACTION-STATES.md §2) even though it draws no
 * border of its own. The three sanctioned opt-outs listed there stay opt-outs; nothing here
 * changes them.
 */
export type FieldVariant = 'boxed' | 'seamless'

// The seamless state set. `outline-none` kills the UA outline on plain `:focus` (the global rule
// only handles `:focus-visible`); Tailwind's preflight already zeroes border and padding, so there
// is no `border-0`/`p-0` here to collide with a call site that wants a border on hover.
//
// ERROR without a border to paint. A boxed field says "this is wrong" with `border-danger`, and a
// seamless one has no border, so the value itself takes the danger tone. The `aria-[invalid=true]:`
// variant compiles to `.aria-\[invalid\=true\]\:text-danger[aria-invalid="true"]`, specificity
// (0,2,0), so it beats whatever single `text-*` class the call site supplies — the error state is
// the one thing seamless does override, on purpose.
const fieldSeamless =
  'bg-transparent outline-none placeholder:text-subtle aria-[invalid=true]:text-danger disabled:opacity-50 disabled:cursor-not-allowed'

function fieldWithVariant(variant: FieldVariant = 'boxed'): string {
  return variant === 'seamless' ? fieldSeamless : 'input'
}

export const labelClasses = 'mu-label'

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { surface?: FieldSurface; variant?: FieldVariant }
>(function Input({ className, surface: _surface, variant = 'boxed', ...props }, ref) {
  return <input ref={ref} className={cn(fieldWithVariant(variant), className)} {...props} />
})

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { surface?: FieldSurface; variant?: FieldVariant }
>(function Textarea({ className, surface: _surface, variant = 'boxed', ...props }, ref) {
  return (
    <textarea
      ref={ref}
      // A seamless textarea is a composer inside a box that is already a card: the card owns the
      // frame, so the drag grip in its bottom-right corner would be a second, competing edge. All
      // six borderless composers in the product suppressed it by hand; the variant does it once.
      className={cn(fieldWithVariant(variant), variant === 'seamless' && 'resize-none', className)}
      {...props}
    />
  )
})

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn(labelClasses, className)} {...props} />
}

// `Field` is the labelled-control primitive — prefer it over a bare <Label> + sibling <Input>.
//
// A bare `<Label>Name</Label>` next to an `<Input />` renders a <label> with no `htmlFor` and an
// input with no `id`, so the two are not associated: the control is programmatically unlabelled,
// a screen reader announces "edit text, blank", and clicking the label does not focus the field.
// Field fixes that by WRAPPING the control, which is HTML's implicit association — no id to mint,
// no `htmlFor` to thread, and (unlike a useId() default) no hook, so this file stays importable
// from Server Components. Pass `htmlFor`/`id` explicitly if you need the explicit form instead.
//
// Wrap exactly ONE control. Implicit association binds the label to the first labelable descendant,
// so a Field containing two inputs would name only the first; use two Fields.
//
// 🔒 ENFORCED. `pnpm check:labels` (ADR-966) fails the build on a <label> that names nothing or
// nests inside another. If you have something that is not one control, do NOT reach for `Label`:
//   several controls -> <p className={labelClasses} id="x"> + role="group" aria-labelledby="x"
//   no control       -> <p className={labelClasses}>  (a caption over a read-only preview, or a
//                       heading over a list of already-labelled rows, is not a label)
export function Field({
  label,
  hint,
  error,
  className,
  labelClassName,
  children,
}: {
  label: ReactNode
  /** Optional helper text rendered under the control, inside the label. */
  hint?: ReactNode
  /** What is wrong with the current value. Replaces the hint while it is set (two lines of
   *  small print under one control is noise, and the error is the one that matters), and is
   *  announced politely when it appears. Pair it with `aria-invalid` on the CONTROL — Field
   *  wraps its child rather than cloning it, so it cannot set that attribute for you, and the
   *  danger border in `fieldClasses` keys off `aria-invalid`, not off this prop. */
  error?: ReactNode
  className?: string
  labelClassName?: string
  children: ReactNode
}) {
  return (
    <label className={cn('field', className)}>
      <span className={cn('mu-label', labelClassName)}>{label}</span>
      {children}
      {hint && !error ? <span className="mu-hint">{hint}</span> : null}
      {/* `contents`, so the live region adds no empty row (and no gap) to the field's column. */}
      <span aria-live="polite" className="contents">
        {error ? <span className="mu-err">{error}</span> : null}
      </span>
    </label>
  )
}
