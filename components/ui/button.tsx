import { forwardRef, type ButtonHTMLAttributes, type ReactElement, cloneElement, isValidElement } from 'react'
import { cn } from '@/lib/utils'

// Shared button primitive — the audit found ~40 files hand-rolling button class
// strings with drifting padding / size / feedback. One scale here (variant ×
// size); `className` still merges for genuine one-offs (e.g. `w-full`, a shadow).

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'warning'
  | 'dangerOutline'
  | 'warningOutline'
  | 'successOutline'
type ButtonSize = 'sm' | 'md'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border bg-surface text-text hover:border-border-strong hover:bg-surface-elevated',
  ghost: 'text-muted hover:bg-surface-elevated hover:text-text',
  danger: 'bg-danger text-white hover:opacity-90',
  // Solid caution action (moderation Hide/Warn) — the danger shape in the warning tone.
  warning: 'bg-warning text-white hover:opacity-90',
  // Outlined state-change actions (Delete account / Deactivate / Reactivate):
  // quieter than the solid fills, tinting on hover. One scale, three tones.
  dangerOutline: 'border border-danger text-danger hover:bg-danger-bg',
  warningOutline: 'border border-warning/60 text-warning hover:bg-warning-bg',
  successOutline: 'border border-success text-success hover:bg-success-bg',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

/** The exact button token string for a variant × size — so a styled `<Link>` (or
 *  any non-`<button>` element) shares the SAME tokens as `<Button>` without a
 *  hand-rolled `bg-primary…` class string. Pass `className` for one-off extras. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(BASE, VARIANT[variant], SIZE[size], className)
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
    size?: ButtonSize
    /** Render the button's classes onto the single child element instead of a
     *  `<button>` — use to style a `<Link>` (`<Button asChild><Link …>…`). */
    asChild?: boolean
  }
>(function Button({ variant = 'primary', size = 'md', className, asChild, children, ...props }, ref) {
  const classes = buttonClasses(variant, size, className)
  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>
    return cloneElement(child, { className: cn(classes, child.props.className) })
  }
  return (
    <button ref={ref} className={classes} {...props}>
      {children}
    </button>
  )
})
