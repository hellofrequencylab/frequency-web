'use client'

// The one launcher for the contact importer popup. Mount it anywhere a surface wants to bring
// contacts in and hand it an ImportTarget:
//   <ImportContactsButton target={{ kind: 'platform' }} />                 // Frequency's own list
//   <ImportContactsButton target={{ kind: 'space', spaceId }} spaceName /> // a Space's sealed list
//   <ImportContactsButton target={{ kind: 'member' }} />                   // a member's own book
// It owns only the button + open state; the wizard (and its gating) lives in the modal. Client
// component, so it is safe to drop into a Server Component surface (e.g. the platform CRM page).

import { useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { ContactImportModal } from './contact-import-modal'
import type { ImportTarget } from '@/lib/crm/import/types'

export function ImportContactsButton({
  target,
  spaceName,
  label = 'Import contacts',
  variant = 'primary',
  className = '',
}: {
  target: ImportTarget
  /** Display name for a space target (shown as the sealed destination in the modal). */
  spaceName?: string
  label?: string
  /** Visual weight. `primary` is the filled brand button; `subtle` is a bordered secondary. */
  variant?: 'primary' | 'subtle'
  className?: string
}) {
  const [open, setOpen] = useState(false)

  const base =
    'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40'
  const tone =
    variant === 'primary'
      ? 'bg-primary text-on-primary hover:bg-primary-hover'
      : 'border border-border-strong text-text hover:bg-surface-elevated'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${base} ${tone} ${className}`}>
        <UploadCloud className="h-4 w-4" />
        {label}
      </button>
      <ContactImportModal open={open} onClose={() => setOpen(false)} target={target} spaceName={spaceName} />
    </>
  )
}
