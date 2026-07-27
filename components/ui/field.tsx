import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type LabelHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Shared form-field styling + primitives — one source of truth for inputs,
// textareas, selects, and labels (the audit found this class string copy-pasted
// across ~40 files). Use the components for new code; `fieldClasses` is for the
// element a component can't wrap directly (e.g. a native <select>). The focus look
// is the calm, neutral halo standardized in the sitewide focus sweep — never the
// amber :focus-visible ring (this wins by specificity).

export const fieldClasses =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition-colors focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'

export const labelClasses = 'text-xs font-medium text-muted'

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
  className,
  labelClassName,
  children,
}: {
  label: ReactNode
  /** Optional helper text rendered under the control, inside the label. */
  hint?: ReactNode
  className?: string
  labelClassName?: string
  children: ReactNode
}) {
  return (
    <label className={cn('block', className)}>
      <span className={cn(labelClasses, 'mb-1 block', labelClassName)}>{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-subtle">{hint}</span> : null}
    </label>
  )
}
