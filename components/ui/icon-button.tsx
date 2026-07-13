import Link from 'next/link'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// The modern icon-group control: a tight 32px icon-only affordance for row-action
// clusters (Edit / Duplicate / Delete and friends), the density the marketplace
// storefront shipped as the exemplar (app/(main)/market/manage/page.tsx). The `label`
// is BOTH the accessible name and the hover tooltip, so nothing is lost by dropping
// the visible text. Compose these side by side in a `flex items-center gap-1` cluster.
// `danger` tints the hover for destructive actions. Token-only, with a focus ring.

const iconControl =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50'

function tone(danger?: boolean) {
  return danger ? 'hover:text-danger' : 'hover:text-text'
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
