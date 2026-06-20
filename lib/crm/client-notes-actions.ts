'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for client notes (ENTITY-SPACES-BUILD §C Phase 2).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the pure body
// helper or the shared types. Those live in lib/crm/client-notes.ts (no directive: pure helper + IO
// + the action implementations + types, all unit-testable). This thin file is the seam the CLIENT
// notes surface imports, so the mutations cross the network boundary as proper Server Actions:
//   client-notes-panel.tsx -> addClientNote / deleteClientNote
//
// The owner-gated READ (listClientNotes) is imported straight from lib/crm/client-notes.ts by the
// SERVER component that renders the thread; it never crosses a client boundary, so it needs no
// wrapper. The authorization + validation all live in the implementations; these wrappers re-expose
// them. client_notes is PERSONAL DATA, so both writes stay owner-gated + space-scoped server-side.

import {
  addClientNote as addClientNoteImpl,
  deleteClientNote as deleteClientNoteImpl,
} from '@/lib/crm/client-notes'
import { type ActionResult } from '@/lib/action-result'

/** Add a note about a contact. Gated on canEditProfile + space-scoped (see the implementation). */
export async function addClientNote(
  spaceId: string,
  contactId: string,
  body: string,
): Promise<ActionResult<{ id: string }>> {
  return addClientNoteImpl(spaceId, contactId, body)
}

/** Delete a note. Gated on canEditProfile for the note's own Space + space-scoped delete. */
export async function deleteClientNote(spaceId: string, noteId: string): Promise<ActionResult> {
  return deleteClientNoteImpl(spaceId, noteId)
}
