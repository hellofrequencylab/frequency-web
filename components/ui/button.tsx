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
type ButtonSize = 'sm' | 'md'

const VARIANT: Record<ButtonVariant, string> = {
  // FLAT FILL, NO FINISH (ADR-1096). The label carried an eight-shadow text-emboss ring and a
  // chisel inset bevel; both are gone. Neither was ever required: ADR-1031 decided this pair
  // ships white-on-amber as a KNOWN exception that we DISCLOSE, and explicitly rejected the two
  // moves that would raise the ratio. The emboss arrived six days later as a styling ask, and
  // its own CSS comment shows it was reasoned about as a way to move the axe number, which is
  // gaming the instrument rather than fixing the pair. `lift-1` gives the button its edge
  // instead — an outer elevation, which is what the hand-rolled primaries beside it were already
  // using, and which is why they looked cleaner than this one.
  //
  // 🔴 THE TWO DELETED NAMES ABOVE ARE BARE ON PURPOSE. `check:phantom` reads every
  // backtick-delimited run in these files as a class string — it does not strip comments — so
  // writing a class that no longer emits CSS inside backticks re-creates the exact phantom the
  // deletion removed, and fails the build. Name a deleted class in prose, never in backticks.
  primary: 'bg-primary text-on-primary lift-1 hover:bg-primary-hover',
  // The MUTED amber: present, but not shouting until it matters. The token pair the system
  // already carries for exactly this (`bg-primary-bg` + `text-primary-strong`, ~250 sites), on
  // the primitive so a control can go quiet at rest without hand-rolling a fill string. Hover
  // steps up to the full amber, which is the "this is the same button, louder" cue. First
  // consumer: the dock's chat tab, muted until there is an unread.
  primarySoft: 'bg-primary-bg text-primary-strong hover:bg-primary-hover hover:text-on-primary',
  secondary: 'border border-border bg-surface text-text hover:border-border-strong hover:bg-surface-elevated',
  ghost: 'text-muted hover:bg-surface-elevated hover:text-text',
  danger: 'bg-danger text-on-danger lift-1 hover:opacity-90',
  // Solid caution action (moderation Hide/Warn) — the danger shape in the warning tone.
  warning: 'bg-warning text-on-warning lift-1 hover:opacity-90',
  // Outlined state-change actions (Delete account / Deactivate / Reactivate):
  // quieter than the solid fills, tinting on hover. One scale, three tones.
  dangerOutline: 'border border-danger text-danger hover:bg-danger-bg',
  warningOutline: 'border border-warning/60 text-warning hover:bg-warning-bg',
  successOutline: 'border border-success text-success hover:bg-success-bg',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-meta',
  md: 'px-4 py-2 text-body-sm',
}

// State set per docs/INTERACTION-STATES.md §2 (Action control): rest · hover (VARIANT) ·
// pressed (`.press`, the ONE sanctioned pressed look) · focus-visible (the global amber ring
// in app/globals.css) · loading (the `loading` prop) · disabled.
// The transition names the properties the state changes actually touch — `transform` has to be
// in the list or `.press` snaps instead of easing. `motion-reduce:transition-none` is the guard
// (`.press` itself is already collapsed under prefers-reduced-motion in globals.css).
// 🔴 `tap-target` is on the BASE, not on a size, and it is the fix for the most widespread touch
// defect in the product. The SIZE strings above set padding and type and nothing else, so a
// button's height was whatever its line-box happened to add up to:
//
//   sm  →  py-1.5 (12.75px) + text-meta's 17px box     = 29.75px
//   md  →  py-2   (17px)    + text-body-sm's 21.25px   = 38.25px
//
// Both are under the 44px touch floor, and this primitive is the most-used interactive element
// in the app — so every <Button> and every buttonClasses()-styled <Link> was undersized on a
// phone. The repo already had the tool: `--tap-min` is 32px and rises to 44px under
// `@media (pointer: coarse)` (globals.css), and `@utility tap-target` consumes it. It simply was
// never composed here.
//
// `min-block-size` does not fight an explicit `h-*` from a caller — a minimum only ever raises,
// so shape overrides like the dock trigger's `h-full w-11` keep their geometry. On a mouse the
// change is 29.75 → 32px for `sm` and nothing for `md`.
const BASE =
  // DAWN: controls take the ROLE radius (skinnable), not a literal step (dawn/tokens/spacing.css).
  'inline-flex items-center justify-center gap-1.5 rounded-control font-semibold tap-target press transition-[color,background-color,border-color,box-shadow,transform] motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed'

/** The button's GEOMETRY ALONE — shape, padding, type scale, press/focus states and the
 *  `tap-target` floor — carrying NO palette whatsoever.
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
  return cn(BASE, SIZE[size], className)
}

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
