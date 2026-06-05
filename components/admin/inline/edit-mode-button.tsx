'use client'

import { Pencil, Check } from 'lucide-react'
import { useEditMode } from '@/lib/admin/use-edit-mode'

// The discoverable Edit trigger for the inline tuning layer (ADR-138). Render it
// only for operators who can manage the page (the caller gates on capability).
// Toggles page-level Edit Mode; inline editors light up while it's on.
export function EditModeButton() {
  const { editing, toggle } = useEditMode()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={editing}
      className={`shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        editing
          ? 'bg-primary text-on-primary hover:bg-primary-hover'
          : 'border border-border bg-surface text-text hover:border-border-strong'
      }`}
    >
      {editing ? (
        <>
          <Check className="h-4 w-4" /> Done
        </>
      ) : (
        <>
          <Pencil className="h-4 w-4" /> Edit
        </>
      )}
    </button>
  )
}

// A lightweight text link that *enters* Edit Mode — for empty-state prompts like
// "+ Add a description" that should drop the operator straight into editing.
export function StartEditingLink({ label }: { label: string }) {
  const { setEditing } = useEditMode()
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-block text-xs text-subtle transition-colors hover:text-primary-strong"
    >
      {label}
    </button>
  )
}
