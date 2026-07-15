'use client'

// The contact importer as a POPUP wizard (not a page), mirroring the Create Event window:
// the shared StudioWindow shell provides the overlay, focus trap, Esc + backdrop close, and
// scroll lock, and the full parse -> match -> review -> done wizard runs INSIDE it. One modal
// serves every target via an ImportTarget:
//   • { kind: 'platform' }        -> Frequency's own ROOT contact hub (staff; no Space picker).
//   • { kind: 'space', spaceId }  -> that Space's sealed list (the membrane fixes the target).
//   • { kind: 'member' }          -> the caller's personal book.
// Client-only: it renders the wizard, which calls server actions for every AI/DB step, so no
// server-only module ever enters this graph. Copy passes NAMING + CONTENT-VOICE (no em dashes).

import { StudioWindow } from '@/components/studio/studio-window'
import { ImportWizard } from './import-wizard'
import type { ImportTarget } from '@/lib/crm/import/types'

function titleFor(target: ImportTarget, spaceName?: string): string {
  if (target.kind === 'platform') return 'Bring contacts into Frequency'
  if (target.kind === 'space') return `Import into ${spaceName ?? 'this space'}`
  return 'Bring in your contacts'
}

export function ContactImportModal({
  open,
  onClose,
  target,
  spaceName,
}: {
  open: boolean
  onClose: () => void
  target: ImportTarget
  /** Display name for a space target (the wizard shows it as the sealed destination). */
  spaceName?: string
}) {
  return (
    <StudioWindow open={open} onClose={onClose} eyebrow="Contacts · Import" closeLabel="Close importer">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-text">{titleFor(target, spaceName)}</h2>
          <p className="mt-1 text-sm text-muted">
            Drop in a file or two, or paste a list. We match the columns, dedupe against what you already
            have, and show a preview before anything is saved.
          </p>
        </div>

        {target.kind === 'space' ? (
          <ImportWizard targetKind="space" lockedSpace={{ id: target.spaceId, name: spaceName ?? 'this space' }} />
        ) : (
          <ImportWizard targetKind={target.kind} />
        )}
      </div>
    </StudioWindow>
  )
}
