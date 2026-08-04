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
  danger: 'bg-danger text-on-danger hover:opacity-90',
  // Solid caution action (moderation Hide/Warn) — the danger shape in the warning tone.
  warning: 'bg-warning text-on-warning hover:opacity-90',
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

// State set per docs/INTERACTION-STATES.md §2 (Action control): rest · hover (VARIANT) ·
// pressed (`.press`, the ONE sanctioned pressed look) · focus-visible (the global amber ring
// in app/globals.css) · loading (the `loading` prop) · disabled.
// The transition names the properties the state changes actually touch — `transform` has to be
// in the list or `.press` snaps instead of easing. `motion-reduce:transition-none` is the guard
// (`.press` itself is already collapsed under prefers-reduced-motion in globals.css).
const BASE =
  // DAWN: controls take the ROLE radius (skinnable), not a literal step (dawn/tokens/spacing.css).
  'inline-flex items-center justify-center gap-1.5 rounded-control font-semibold press transition-[color,background-color,border-color,box-shadow,transform] motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed'

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
    /** A result is coming. Marks the control `aria-busy` and disables it, so a second
     *  tap cannot fire the same action twice (INTERACTION-STATES §1 "loading", §4 rule 4).
     *  The LABEL IS LEFT ALONE on purpose: swapping in "Saving…" or a spinner changes the
     *  button's width, which is the one thing a pending state must never do (§4 rule 3).
     *  The disabled fade is the cue. */
    loading?: boolean
  }
>(function Button(
  { variant = 'primary', size = 'md', className, asChild, loading = false, disabled, children, ...props },
  ref,
) {
  const classes = buttonClasses(variant, size, className)
  if (asChild && isValidElement(children)) {
    // A styled <Link> has no `disabled` attribute, so the loading guard is the ARIA pair plus
    // `pointer-events-none` — the navigation cannot be re-fired while the first one is in flight.
    const child = children as ReactElement<{ className?: string } & Record<string, unknown>>
    return cloneElement(child, {
      className: cn(classes, loading && 'pointer-events-none opacity-50', child.props.className),
      ...(loading ? { 'aria-busy': true, 'aria-disabled': true } : {}),
    })
  }
  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {children}
    </button>
  )
})
