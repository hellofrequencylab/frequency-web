import type { ReactNode } from 'react'

// Field grammar (kit): the one labeled-control row + section label every Studio
// builder uses, so fields read identically everywhere. docs/STUDIO.md §2.

/** A labeled control: the uppercase micro-label above its input/select. */
export function StudioField({
  label,
  children,
  className,
}: {
  label: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-subtle ${className ?? ''}`}>
      {label}
      {children}
    </label>
  )
}

/** A small section label (e.g. a picker group heading). */
export function StudioSectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-2xs font-semibold uppercase tracking-wide text-subtle ${className ?? ''}`}>{children}</p>
  )
}
