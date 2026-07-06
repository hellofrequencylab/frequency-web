import Link from 'next/link'
import { ChevronRight, Users } from 'lucide-react'
import { getContacts } from '@/lib/crm/pipeline'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

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
}: {
  spaceId: string
  slug: string
  selectedContactId: string | null
  /** The path a contact row links to, with `?contact=<id>` appended. Defaults to the canonical CRM
   *  board; the board passes `/spaces/<slug>/crm` too. */
  linkBase?: string
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
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
        {contacts.map((c) => {
          const selected = c.id === selectedContactId
          return (
            <li key={c.id}>
              <Link
                href={`${base}?contact=${c.id}`}
                aria-current={selected ? 'true' : undefined}
                className={`flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-elevated ${
                  selected ? 'bg-surface-elevated' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">
                    {c.display_name || c.email || 'Unnamed contact'}
                  </p>
                  {c.display_name && c.email && (
                    <p className="truncate text-xs text-muted">{c.email}</p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
