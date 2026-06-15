import Image from 'next/image'
import Link from 'next/link'
import { Plus, ScanText, Lock, Globe, MapPin } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import type { NetworkContactListItem } from '@/lib/connections/types'

const SOURCE_LABEL: Record<string, string> = {
  card_scan: 'Scanned',
  poster: 'Poster',
  manual: 'Manual',
  import: 'Imported',
}

/** The member's personal CRM rolodex (network_contacts) inside the Friends home —
 *  the same card grammar as the standalone Profiles surface. Cards still deep-link
 *  to /connections/[id] and capture lands at /connections/new (those routes are
 *  unchanged). */
export function ContactsList({ contacts }: { contacts: NetworkContactListItem[] }) {
  if (contacts.length === 0) {
    return (
      <EmptyState
        icon={ScanText}
        title="No contacts yet"
        description="Scan a business card or poster to harvest someone’s details in seconds, even if they’re not on Frequency yet."
        action={
          <Link
            href="/connections/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" /> Capture a contact
          </Link>
        }
      />
    )
  }
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {contacts.map((c) => (
        <li key={c.id}>
          <EntityCard
            href={`/connections/${c.id}`}
            anchor={
              c.avatarUrl ? (
                <Image src={c.avatarUrl} alt="" width={44} height={44} className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-elevated text-sm font-semibold text-muted">
                  {getInitials(c.displayName ?? '?')}
                </span>
              )
            }
            title={c.displayName ?? 'Unnamed'}
            badge={
              c.visibility === 'network' ? (
                <Globe className="h-3 w-3 shrink-0 text-subtle" aria-label="Shared to your network" />
              ) : (
                <Lock className="h-3 w-3 shrink-0 text-subtle" aria-label="Private to you" />
              )
            }
            context={[c.title, c.company].filter(Boolean).join(' · ') || c.city || c.email || undefined}
            meta={
              <>
                {c.tags.slice(0, 3).map((t) => (
                  <span key={t} className="rounded-full bg-primary-bg px-2 py-0.5 font-medium text-primary-strong">
                    {t}
                  </span>
                ))}
                {c.tags.length > 3 && <span>+{c.tags.length - 3}</span>}
                {c.city && (c.title || c.company) && (
                  <span className="flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" />
                    {c.city}
                  </span>
                )}
                <span>{SOURCE_LABEL[c.source] ?? c.source}</span>
                {c.status !== 'new' && <span className="capitalize">{c.status}</span>}
              </>
            }
          />
        </li>
      ))}
    </ul>
  )
}
