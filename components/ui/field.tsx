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
export const fieldChromeClasses =
  'w-full rounded-control border border-border bg-surface text-body-sm text-text outline-none transition-colors focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:border-danger aria-[invalid=true]:focus:ring-danger/30 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-subtle'

export const fieldClasses = `${fieldChromeClasses} px-3 py-2`

export const labelClasses = 'text-meta font-medium text-muted'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldClasses, className)} {...props} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldClasses, className)} {...props} />
  },
)

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
