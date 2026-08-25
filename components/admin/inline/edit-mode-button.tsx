'use client'

import { useEditMode } from '@/lib/admin/use-edit-mode'

// The inline tuning layer's in-page entry point (ADR-138). This file used to also export
// `EditModeButton`, the Pencil/Check toggle pill docs/EMBEDDED-ADMIN.md still describes. It had
// no caller anywhere in the tree (verified 2026-08-25, SCAN-501) and is deleted. Edit Mode is
// URL state (`?edit=1`, lib/admin/use-edit-mode.ts), so it is entered by any link carrying the
// param and by the StartEditingLink below; nothing needed the pill to turn it on. NOTE for a
// later sweep: with the pill gone, `useEditMode().toggle` has no caller either.

// A lightweight text link that *enters* Edit Mode — for empty-state prompts like
// "+ Add a description" that should drop the operator straight into editing.
export function StartEditingLink({ label }: { label: string }) {
  const { setEditing } = useEditMode()
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-block text-meta text-subtle transition-colors hover:text-primary-strong"
    >
      {label}
    </button>
  )
}
