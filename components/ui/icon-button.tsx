import Link from 'next/link'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// The modern icon-group control: a tight 32px icon-only affordance for row-action
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
const iconControl =
  'inline-flex h-8 w-8 items-center justify-center rounded-control text-subtle press transition-[color,background-color,box-shadow,transform] motion-reduce:transition-none hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50'

function tone(danger?: boolean) {
  return danger ? 'hover:text-danger' : 'hover:text-muted'
}

/** An icon-only <button> for a row action. `label` names it for a11y + the tooltip. */
export function IconButton({
  label,
  danger,
  className,
  children,
  ...props
}: { label: string; danger?: boolean; children: ReactNode } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(iconControl, tone(danger), className)}
      {...props}
    >
      {children}
    </button>
  )
}

/** An icon-only navigation control (same density as IconButton, rendered as a Link). */
export function IconLink({
  label,
  danger,
  href,
  className,
  children,
  ...props
}: { label: string; danger?: boolean; href: string; children: ReactNode } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'aria-label' | 'href'
>) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(iconControl, tone(danger), className)}
      {...props}
    >
      {children}
    </Link>
  )
}
