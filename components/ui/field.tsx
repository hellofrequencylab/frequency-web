import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type LabelHTMLAttributes } from 'react'
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
