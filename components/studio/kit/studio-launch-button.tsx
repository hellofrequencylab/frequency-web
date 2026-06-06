'use client'

import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { StudioWindow } from '../studio-window'

// Launch kit: a trigger button that opens the Studio window in place, with managed
// open state. The entity passes its window content (children) + footer (which can
// reference the entity's own form state). Used by NewJourneyButton; the same
// pattern fronts every entity's create. docs/STUDIO.md §2.

export function StudioLaunchButton({
  label,
  icon: Icon,
  className,
  eyebrow,
  children,
  footer,
  onOpenChange,
}: {
  label: ReactNode
  icon?: LucideIcon
  className?: string
  eyebrow?: ReactNode
  children: ReactNode
  footer?: ReactNode
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const set = (v: boolean) => { setOpen(v); onOpenChange?.(v) }

  return (
    <>
      <button
        type="button"
        onClick={() => set(true)}
        className={className ?? 'inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover'}
      >
        {Icon && <Icon className="h-4 w-4" />} {label}
      </button>
      <StudioWindow open={open} onClose={() => set(false)} eyebrow={eyebrow} footer={footer}>
        {children}
      </StudioWindow>
    </>
  )
}
