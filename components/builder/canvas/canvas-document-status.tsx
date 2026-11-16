// WHICH DOCUMENT THE CANVAS IS ON, AND WHETHER IT IS SAVED (PROG-E5B). One line of words, no colour alone: the
// Space, whether the draft or the published page was opened, why saving is off when it is, and the save state.

import type { CanvasDocumentView } from '@/lib/builder/canvas-document'
import type { CanvasSaveState } from './use-canvas-document'

const SAVE_WORDS: Record<CanvasSaveState, string> = {
  saved: 'Draft saved.',
  unsaved: 'Unsaved changes.',
  saving: 'Saving the draft.',
  error: 'Not saved.',
  conflict: 'Not saved.',
  'read-only': 'Read only.',
}

export function CanvasDocumentStatus({ document, save, problem }: { document: CanvasDocumentView; save: CanvasSaveState; problem: string | null }) {
  return (
    <div className="mb-3 space-y-1 text-body-sm" data-canvas-document={document.source}>
      <p>
        {document.source === 'draft'
          ? `Editing the draft of ${document.spaceName}.`
          : `Showing the published page of ${document.spaceName}. Your first change starts a draft.`}{' '}
        <span className="text-muted">Nothing here publishes. Publish from the Space when the draft is ready.</span>
      </p>
      <p role="status" aria-live="polite" className="text-meta text-muted" data-save-state={save}>
        {SAVE_WORDS[save]} {problem ?? document.notice ?? ''}
      </p>
    </div>
  )
}
