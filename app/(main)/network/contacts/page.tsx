import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, ScanText, Lock, Globe, MapPin, Search, Contact, UserRoundCheck } from 'lucide-react'
import { contactsOwnerId } from '@/lib/connections/access'
import { listContacts } from '@/lib/connections/store'
import { findContactMatches } from '@/lib/connections/matching'
import { getInitials } from '@/lib/utils'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import { ContactMatches } from '@/components/connections/contact-matches'
import type { ContactStatus, NetworkContactListItem } from '@/lib/connections/types'

export const dynamic = 'force-dynamic'

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
] as const
type StatusFilter = (typeof STATUS_TABS)[number]['key']

const SOURCE_LABEL: Record<string, string> = {
  card_scan: 'Scanned', poster: 'Poster', manual: 'Manual', import: 'Imported',
}

function matches(c: NetworkContactListItem, status: StatusFilter, q: string): boolean {
  if (status !== 'all' && c.status !== (status as ContactStatus)) return false
  if (!q) return true
  const hay = [c.displayName, c.company, c.title, c.city, c.email, ...c.tags].join(' ').toLowerCase()
  return hay.includes(q)
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const ownerId = await contactsOwnerId()
  if (!ownerId) redirect('/feed')

  const { status: rawStatus, q: rawQ } = await searchParams
  const status: StatusFilter = (STATUS_TABS.find((s) => s.key === rawStatus)?.key ?? 'all') as StatusFilter
  const q = (rawQ ?? '').trim().toLowerCase()

  const [all, suggestions] = await Promise.all([
    listContacts(ownerId),
    findContactMatches(ownerId),
  ])
  const rows = all.filter((c) => matches(c, status, q))

  return (
    <div className="mx-auto max-w-5xl">
      <IndexTemplate
        title={
          <span className="flex items-center gap-2">
            <Contact className="h-5 w-5 text-primary-strong" />
            My Contacts
          </span>
        }
        description="People you’ve met. Scanned from a card or poster, or added by hand. Private to you unless you promote them to your network."
        action={
          <Link
            href="/connections/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" /> New profile
          </Link>
        }
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
            <div className="flex gap-1">
              {STATUS_TABS.map((t) => {
                const active = status === t.key
                const count = all.filter((c) => matches(c, t.key, q)).length
                const href = t.key === 'all'
                  ? `/network/contacts${q ? `?q=${encodeURIComponent(q)}` : ''}`
                  : `/network/contacts?status=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`
                return (
                  <Link
                    key={t.key}
                    href={href}
                    className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      active ? 'border-primary text-primary-strong' : 'border-transparent text-muted hover:text-text'
                    }`}
                  >
                    {t.label} <span className="text-subtle">{count}</span>
                  </Link>
                )
              })}
            </div>
            <form className="relative pb-2" action="/network/contacts" method="get">
              {status !== 'all' && <input type="hidden" name="status" value={status} />}
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-[calc(50%+4px)] text-subtle" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search…"
                className="w-44 rounded-lg border border-border-strong bg-surface py-1.5 pl-8 pr-2 text-sm text-text placeholder-subtle focus:border-border-strong focus:outline-none"
              />
            </form>
          </div>
        }
      >
      <ContactMatches suggestions={suggestions} />
      {rows.length === 0 ? (
        <EmptyState
          icon={ScanText}
          title={all.length === 0 ? 'No profiles yet' : 'Nothing matches that filter'}
          description={all.length === 0 ? 'Scan a business card to harvest someone’s details in seconds.' : undefined}
          action={
            all.length === 0 ? (
              <Link
                href="/connections/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" /> New profile
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <li key={c.id}>
              <EntityCard
                href={`/connections/${c.id}`}
                anchor={
                  c.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-elevated text-sm font-semibold text-muted">
                      {getInitials(c.displayName ?? '?')}
                    </span>
                  )
                }
                title={c.displayName ?? 'Unnamed'}
                badge={
                  c.visibility === 'network'
                    ? <Globe className="h-3 w-3 shrink-0 text-subtle" aria-label="Shared to your network" />
                    : <Lock className="h-3 w-3 shrink-0 text-subtle" aria-label="Private to you" />
                }
                context={
                  [c.title, c.company].filter(Boolean).join(' · ')
                  || c.city
                  || c.email
                  || undefined
                }
                meta={
                  <>
                    {c.linkedProfileId && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 font-medium text-success">
                        <UserRoundCheck className="h-3 w-3" /> On Frequency
                      </span>
                    )}
                    {c.tags.slice(0, 3).map((t) => (
                      <span key={t} className="rounded-full bg-primary-bg px-2 py-0.5 font-medium text-primary-strong">{t}</span>
                    ))}
                    {c.tags.length > 3 && <span>+{c.tags.length - 3}</span>}
                    {c.city && (c.title || c.company) && (
                      <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{c.city}</span>
                    )}
                    <span>{SOURCE_LABEL[c.source] ?? c.source}</span>
                    {c.status !== 'new' && <span className="capitalize">{c.status}</span>}
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
      </IndexTemplate>
    </div>
  )
}
