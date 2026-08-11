import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type LabelHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Shared form-field styling + primitives — one source of truth for inputs,
// textareas, selects, and labels (the audit found this class string copy-pasted
// across ~40 files). Use the components for new code; `fieldClasses` is for the
// element a component can't wrap directly (e.g. a native <select>). The focus look
// is the calm, neutral halo standardized in the sitewide focus sweep — never the
// amber :focus-visible ring (this wins by specificity).

// State set per docs/INTERACTION-STATES.md §2 (Field): rest · focus-visible · error · disabled.
// ERROR is driven by `aria-invalid` on the control itself, so the a11y attribute and the look can
// never drift apart: set `aria-invalid` when the value is bad and the danger border follows. ~9
// call sites already set it and got nothing back visually; they light up from this one string.
// DISABLED also takes `cursor-not-allowed`, so the state reads before a click, not after.
// `fieldChromeClasses` is the field LOOK with no padding of its own — border, surface, type,
// the calm focus halo, the aria-invalid error and the disabled fade. It exists so a control that
// must own its own padding can wear the same chrome WITHOUT fighting `px-3`: `Select` reserves a
// right-hand gutter for its chevron, and `pr-9` layered over `px-3` is a logical-vs-physical
// padding collision whose winner depends on Tailwind's emit order, not on the class list. Split
// once here, and the two strings can never drift.
// The chrome with NO fill of its own. Split out so a field can wear a different surface without
// two `bg-*` utilities landing in one class string — see `FieldSurface` below for why that split
// has to exist rather than being solved at the call site.
// SHAPE AND STATE, WITH NO PALETTE. Split out on 2026-08-11 so a field-class control can wear a
// different RESTING COLOUR without two `border-*` or two `text-*` utilities landing in one string —
// the same reason `fieldChromeNoFill` exists for the fill. It carries the box, the type role, the
// calm focus halo, the `aria-invalid` error and the disabled fade; it carries no border colour, no
// text colour and no fill. `Select`'s `tone` prop is the first consumer (a chip filter whose active
// state is a border + fill + text swap), and it is why the split had to happen in this file rather
// than being re-derived next door: one shape, one focus treatment, no drift.
export const fieldChromeShape =
  'w-full rounded-control border text-body-sm outline-none transition-colors focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:border-danger aria-[invalid=true]:focus:ring-danger/30 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-subtle'

/** The neutral resting palette every field wears unless it says otherwise. No fill. */
export const fieldToneNeutral = 'border-border text-text'

const fieldChromeNoFill = `${fieldChromeShape} ${fieldToneNeutral}`

export const fieldChromeClasses = `${fieldChromeNoFill} bg-surface`

export const fieldClasses = `${fieldChromeClasses} px-3 py-2`

/**
 * Which surface a field's fill sits on.
 *
 *   default  `bg-surface` — pure white. A field on the canvas or on a white card.
 *   post     `bg-surface-post` — the feed post-card surface. A field INSIDE a post.
 *   inset    `bg-canvas` — the field reads as a WELL cut into a lighter card. The beta
 *            induction, the member-link search and the QR title all sit inside a
 *            `bg-surface` card, where a `bg-surface` field is invisible: same fill, and the
 *            hairline border is the only thing separating control from container. Those
 *            surfaces each hand-rolled the inset field rather than adopt the primitive,
 *            and the raw-input ratchet was RAISED on 2026-08-07 to book three more of them
 *            (ADR-959) with "Input is bg-surface … the primitive would render them
 *            invisible" as the stated reason. This is that reason answered.
 *
 * 🔴 WHY THIS IS A PROP AND NOT A CLASSNAME (owner, 2026-08-06: "make all comment and dispatch box
 * backgrounds the same as the post box in every feed"). `cn` is a plain join, so passing
 * `className="bg-surface-post"` to a control whose base string already says `bg-surface` emits BOTH
 * utilities and lets Tailwind's stylesheet order decide the winner — not the call site. That is the
 * same trap `IconButton` documents for its `h-8 w-8`, and it is worse here because the two classes
 * differ by eight units of grey: the bug would be invisible in review and visible on screen.
 * Choosing the fill INSIDE the component keeps exactly one `bg-*` in the string.
 */
export type FieldSurface = 'default' | 'post' | 'inset'

const FIELD_FILL: Record<FieldSurface, string> = {
  default: 'bg-surface',
  post: 'bg-surface-post',
  inset: 'bg-canvas',
}

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

function fieldWithSurface(surface: FieldSurface, variant: FieldVariant = 'boxed'): string {
  if (variant === 'seamless') return fieldSeamless
  return `${fieldChromeNoFill} ${FIELD_FILL[surface]} px-3 py-2`
}

export const labelClasses = 'text-meta font-medium text-muted'

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { surface?: FieldSurface; variant?: FieldVariant }
>(function Input({ className, surface = 'default', variant = 'boxed', ...props }, ref) {
  return <input ref={ref} className={cn(fieldWithSurface(surface, variant), className)} {...props} />
})

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { surface?: FieldSurface; variant?: FieldVariant }
>(function Textarea({ className, surface = 'default', variant = 'boxed', ...props }, ref) {
  return (
    <textarea
      ref={ref}
      // A seamless textarea is a composer inside a box that is already a card: the card owns the
      // frame, so the drag grip in its bottom-right corner would be a second, competing edge. All
      // six borderless composers in the product suppressed it by hand; the variant does it once.
      className={cn(fieldWithSurface(surface, variant), variant === 'seamless' && 'resize-none', className)}
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
    <label className={cn('block', className)}>
      <span className={cn(labelClasses, 'mb-1 block', labelClassName)}>{label}</span>
      {children}
      {hint && !error ? <span className="mt-1 block text-meta text-subtle">{hint}</span> : null}
      <span aria-live="polite">
        {error ? <span className="mt-1 block text-meta font-medium text-danger">{error}</span> : null}
      </span>
    </label>
  )
}
