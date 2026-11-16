import { Users } from 'lucide-react'
import { getContacts } from '@/lib/crm/pipeline'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { SpaceContactsList } from './space-contacts-list'

// PER-SPACE CONTACTS (ENTITY-SPACES-BUILD Phase 2). A self-fetching server component that lists THIS
// Space's CRM contacts, scoped by space_id. Each row links to the detail/notes surface for that contact
// (?contact=<id> on the surface named by `linkBase`), so the owner picks a person and sees their detail
// beside the list. `linkBase` defaults to the canonical CRM board (/crm); the CRM board passes its own
// base so a row opens the on-board contact detail.
// Composes kit primitives (SectionHeader, EmptyState). No em/en dashes (CONTENT-VOICE §10).

export async function SpaceContacts({
  spaceId,
  slug,
  selectedContactId,
  linkBase,
  canEmail = false,
}: {
  spaceId: string
  slug: string
  selectedContactId: string | null
  /** The path a contact row links to, with `?contact=<id>` appended. Defaults to the canonical CRM
   *  board; the board passes `/spaces/<slug>/crm` too. */
  linkBase?: string
  /** A Space editor may pick people and email them (SCAN-1221); the send re-gates server-side. */
  canEmail?: boolean
}) {
  const base = linkBase ?? `/spaces/${slug}/crm`
  const contacts = await getContacts(spaceId)

  if (contacts.length === 0) {
    return (
      <section>
        <SectionHeader title="Contacts" />
        <EmptyState
          icon={Users}
          title="No contacts yet."
          description="People you track for this space show here. Pick one to read or add notes."
        />
      </section>
    )
  }

  return (
    <section>
      <SectionHeader title="Contacts" count={contacts.length} />
      <SpaceContactsList
        spaceId={spaceId}
        slug={slug}
        base={base}
        selectedContactId={selectedContactId}
        canEmail={canEmail}
        contacts={contacts.map((c) => ({ id: c.id, email: c.email, displayName: c.display_name }))}
      />
    </section>
  )
}
