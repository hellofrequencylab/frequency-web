import Link from 'next/link'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// The modern icon-group control: a tight 32px icon-only affordance for row-action (44px on
// touch, see TOUCH TARGET below)
// clusters (Edit / Duplicate / Delete and friends), the density the marketplace
// storefront shipped as the exemplar (app/(main)/market/manage/page.tsx). The `label`
// is BOTH the accessible name and the hover tooltip, so nothing is lost by dropping
// the visible text. Compose these side by side in a `flex items-center gap-1` cluster.
// `danger` tints the hover for destructive actions. Token-only, with a focus ring.

// DAWN alignment (dawn/components/core/IconButton.jsx): role radius on the control,
// and the quiet-by-default color pair — subtle icon at rest, muted on the warm
// hover wash (one step quieter than text, so icon clusters never shout).
// State set per docs/INTERACTION-STATES.md §2 (Action control): rest · hover (the warm wash +
// the `tone()` icon step) · pressed (`.press`) · focus-visible · disabled. `transform` joins the
// transition list so the press eases rather than snapping; `motion-reduce:transition-none` guards
// it (`.press` is already collapsed under prefers-reduced-motion in globals.css).
// TOUCH TARGET. 32px is the right DENSITY for a mouse and too small for a thumb: the
// platform floor is 44 (Apple HIG) / 48dp (Material), and DAWN's own note says "keep size
// >= 36 for touch targets" -- which nothing enforced, so 42 call sites shipped at 32.
//
// The box GROWS on coarse pointers rather than bleeding a ::after hit area, because these
// compose in `flex items-center gap-1` clusters: a 44px pseudo-element on a 32px box
// overlaps its neighbour by 8px on each side, and an overlapping target fires the WRONG
// action -- worse than a small one. Real boxes at 44px with a 4px gap simply do not touch.
//
// Coarse-only, so the desktop density the marketplace exemplar was designed around is
// byte-identical. `[@media(pointer:coarse)]` rather than a breakpoint: a 1024px tablet is
// still a thumb, and a 390px window on a laptop is still a mouse.
// TWO VARIANTS, because the product shipped two and only one of them was in the kit.
// A census of hand-rolled `h-8 w-8 items-center justify-center rounded-*` controls found
// 26 across 16 files, and they were not noise -- they clustered on one shape the kit did
// not offer: a BORDERED square (`border border-border text-muted`, hover moves the border
// colour rather than washing the background), with four tones. Twelve sites, written out
// longhand twelve times, none of them carrying tap-target, `.press`, or a focus ring.
//
//   plain     the row-action density (no chrome at rest, warm wash on hover). The kit
//             default and the marketplace exemplar.
//   bordered  a standing control that must read as pressable before you touch it --
//             form-row steppers, tier editors, seat controls.
//
// Tone is a four-way axis, not the old `danger` boolean: the bordered sites in the wild
// already used warning and success hovers, so a boolean could not have absorbed them.
const iconControlBase =
  // `aria-disabled:` sits beside `disabled:` because this string is shared by IconButton (a real
  // <button>, where :disabled matches) and IconLink (a <Link> → <a>, where it NEVER can). Until
  // 2026-08-10 the anchor path carried the disabled utilities as dead CSS: a caller asking for a
  // disabled icon-link got no dimming, no pointer block, and a fully clickable control.
  'tap-target inline-flex h-8 w-8 items-center justify-center rounded-control press transition-[color,background-color,border-color,box-shadow,transform] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50'

// THREE VARIANTS. `filled` is the third, added 2026-08-05, and it was added because the code
// asked for it in prose: `events/event-calendar.tsx`, `marketplace/column-selector.tsx` and
// `admin/crm/live-chat-bridge.tsx` each carry a comment saying the control stays hand-rolled
// because "IconButton has no filled variant, and `cn` is a plain join, so a className fill would
// be settled by stylesheet order rather than by the call site." That is the correct read of the
// merge rule and the wrong conclusion to have to live with: the fix is a variant, not a merge.
//
// It is the SELECTED half of a segmented toggle (grid-vs-list, a density radiogroup) and the one
// affirmative icon action in a composer row (send). Both are "this control is the answer", which
// is why one variant serves them. It does NOT replace `Button` — a filled icon-only control is
// still an icon affordance at icon density, not a small primary button.
export type IconButtonTone = 'default' | 'danger' | 'warning' | 'success'
export type IconButtonVariant = 'plain' | 'bordered' | 'filled'

// Quiet at rest, one step louder on hover -- so a cluster of these never shouts. `plain`
// rests one step quieter than `bordered` because it has no border to carry the affordance.
const PLAIN_TONE: Record<IconButtonTone, string> = {
  default: 'hover:text-muted',
  danger: 'hover:text-danger',
  warning: 'hover:text-warning',
  success: 'hover:text-success',
}

const BORDERED_TONE: Record<IconButtonTone, string> = {
  default: 'hover:border-border-strong hover:text-text',
  danger: 'hover:border-danger/40 hover:text-danger',
  warning: 'hover:border-warning/40 hover:text-warning',
  success: 'hover:border-success/40 hover:text-success',
}

// Filled is the only variant that is LOUD at rest, so tone here is the fill itself rather than a
// hover step, and each pair carries its own `on-*` foreground so contrast is decided once, here,
// instead of at every call site.
const FILLED_TONE: Record<IconButtonTone, string> = {
  default: 'bg-primary text-on-primary hover:bg-primary-hover',
  danger: 'bg-danger text-on-primary hover:bg-danger/90',
  warning: 'bg-warning text-on-primary hover:bg-warning/90',
  success: 'bg-success text-on-primary hover:bg-success/90',
}

function iconControl(variant: IconButtonVariant = 'plain', tone: IconButtonTone = 'default') {
  if (variant === 'bordered') return cn(iconControlBase, 'border border-border text-muted', BORDERED_TONE[tone])
  if (variant === 'filled') return cn(iconControlBase, FILLED_TONE[tone])
  return cn(iconControlBase, 'text-subtle hover:bg-surface-elevated', PLAIN_TONE[tone])
}

// `ref` is a plain prop, not a forwardRef wrapper: React 19 passes it through like any other,
// and several adopters need the node (a dock header that returns focus to its own trigger, a
// mobile editor that focuses Back on mount). Without it in the props type those sites had to
// stay hand-rolled, which is the primitive losing a call site over a one-line gap.
/** An icon-only <button> for a row action. `label` names it for a11y + the tooltip. */
export function IconButton({
  label,
  variant,
  tone,
  className,
  children,
  ref,
  ...props
}: {
  label: string
  variant?: IconButtonVariant
  tone?: IconButtonTone
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(iconControl(variant, tone), className)}
      {...props}
    >
      {children}
    </button>
  )
}

/** An icon-only navigation control (same density as IconButton, rendered as a Link). */
export function IconLink({
  label,
  variant,
  tone,
  href,
  className,
  children,
  disabled,
  ref,
  ...props
}: {
  label: string
  variant?: IconButtonVariant
  tone?: IconButtonTone
  href: string
  children: ReactNode
  /**
   * An anchor has no `:disabled`, so this maps to `aria-disabled` plus `tabIndex={-1}` — the
   * combination that removes the control from the tab order AND tells assistive tech it is
   * unavailable. `aria-disabled:pointer-events-none` on the shared base handles the pointer.
   * Prefer NOT rendering the link at all where that is an option; this is for the cases where
   * the control must stay in place to keep a row's layout stable.
   */
  disabled?: boolean
  ref?: Ref<HTMLAnchorElement>
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'aria-label' | 'href'>) {
  return (
    <Link
      ref={ref}
      href={href}
      aria-label={label}
      title={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      className={cn(iconControl(variant, tone), className)}
      {...props}
    >
      {children}
    </Link>
  )
}
