import { forwardRef, type ButtonHTMLAttributes, type ReactElement, cloneElement, isValidElement } from 'react'
import { cn } from '@/lib/utils'

// Shared button primitive — the audit found ~40 files hand-rolling button class
// strings with drifting padding / size / feedback. One scale here (variant ×
// size); `className` still merges for genuine one-offs (e.g. `w-full`, a shadow).

type ButtonVariant =
  | 'primary'
  | 'primarySoft'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'warning'
  | 'dangerOutline'
  | 'warningOutline'
  | 'successOutline'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

// The button is the members kit's own `.btn` (ADR-1737; design_handoff/frequency/templates/members/app/app.css):
// a 44px pill, `.pa` the iridescent primary, `.txt` the quiet text action, `.sm` / `.lg` the kit's
// sizes. The kit has no class for the danger, warning and outline tones or for `xs`;
// app/themes/frequency/members-ui.css adds them (`mu-*`).
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'pa',
  primarySoft: 'mu-soft',
  secondary: '',
  ghost: 'txt',
  danger: 'mu-danger',
  warning: 'mu-warning',
  dangerOutline: 'mu-danger-o',
  warningOutline: 'mu-warning-o',
  successOutline: 'mu-success-o',
}
const SIZE: Record<ButtonSize, string> = { xs: 'xs', sm: 'sm', md: '', lg: 'lg' }

/** The button's GEOMETRY ALONE — the kit's `.btn` shape and size, carrying NO palette whatsoever.
 *
 *  This exists because `cn` in this repo is a plain `.filter(Boolean).join(' ')` with NO
 *  tailwind-merge semantics (lib/utils.ts:4; the same trap is documented in skeleton.tsx,
 *  select.tsx and poster-band.tsx). A caller that wants the button's SHAPE but its own
 *  COLOURS therefore cannot pass overrides to `buttonClasses` and expect them to replace a
 *  variant's tokens — both classes survive into the attribute and Tailwind's emit order,
 *  not the call order, decides which paints.
 *
 *  The alternative callers reached for instead was hand-rolling the look, and a hand-rolled
 *  copy of a primitive stops tracking it: the Space hero's on-cover chip did exactly that and
 *  silently missed `tap-target`, so it stayed at its fixed height while the real button beside
 *  it rose with `--tap-min` (26px → 56px across the generation axis). Composing this keeps the
 *  tap floor and every other geometry decision in ONE place while leaving the palette free.
 *
 *  Use `buttonClasses` whenever a standard variant's colours are wanted; reach for this only
 *  when the surface supplies its own (an on-photo scrim chip, a brand-accent fill). */
export function buttonGeometry(size: ButtonSize = 'md', className?: string): string {
  return cn('btn', SIZE[size], className)
}

/** The exact button token string for a variant × size — so a styled `<Link>` (or
 *  any non-`<button>` element) shares the SAME tokens as `<Button>` without a
 *  hand-rolled `bg-primary…` class string. Pass `className` for one-off extras. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn('btn', VARIANT[variant], SIZE[size], className)
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
