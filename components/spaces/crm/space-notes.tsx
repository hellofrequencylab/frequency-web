import { StickyNote } from 'lucide-react'
import { getContact } from '@/lib/crm/pipeline'
import { listClientNotes } from '@/lib/crm/client-notes'
import { EmptyState } from '@/components/ui/empty-state'
import { ClientNotesPanel } from './client-notes-panel'

// PER-SPACE NOTES (server wrapper, ENTITY-SPACES-BUILD Phase 2). Resolves the selected contact +
// their notes through the owner-gated, space-scoped reads (getContact / listClientNotes both filter
// space_id), then hands them to the client panel for add/delete. When no contact is selected (or the
// id is not a contact of THIS Space) it renders a calm prompt rather than another Space's data.
// client_notes is PERSONAL DATA: every read here is gated on the Space owner inside listClientNotes.
// No em/en dashes (CONTENT-VOICE §10).

export async function SpaceNotes({
  spaceId,
  contactId,
  readOnly = false,
}: {
  spaceId: string
  contactId: string | null
  readOnly?: boolean
}) {
  if (!contactId) {
    return (
      <EmptyState
        icon={StickyNote}
        title="Pick a contact."
        description="Choose someone from the list to read or add private notes."
      />
    )
  }

  // The contact must belong to THIS Space (space-scoped lookup); otherwise show the same calm prompt
  // rather than confirming the id exists anywhere.
  const contact = await getContact(contactId, spaceId)
  if (!contact) {
    return (
      <EmptyState
        icon={StickyNote}
        title="Pick a contact."
        description="Choose someone from the list to read or add private notes."
      />
    )
  }

  const notes = await listClientNotes(spaceId, contactId)
  const contactName = contact.display_name || contact.email || 'this contact'

  return (
    <ClientNotesPanel
      spaceId={spaceId}
      contactId={contactId}
      contactName={contactName}
      notes={notes}
      readOnly={readOnly}
    />
  )
}
