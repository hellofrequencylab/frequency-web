import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

// Field grammar (kit): the one labeled-control row + section label every Studio
// builder uses, so fields read identically everywhere. docs/STUDIO.md §2.

/** An instruction block: a calm, bordered callout that explains how a section works, so the
 *  builder guides the author inline instead of assuming they know. Plain copy, no icon noise. */
export function StudioNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-border bg-surface-elevated/60 px-3 py-2 text-xs leading-relaxed text-muted ${className ?? ''}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
      <div className="min-w-0 [&_strong]:font-semibold [&_strong]:text-text">{children}</div>
    </div>
  )
}

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
