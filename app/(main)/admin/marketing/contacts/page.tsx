import Link from 'next/link'
import { Search } from 'lucide-react'
import { searchContacts, type ContactCore } from '@/lib/crm/person'
import { createAdminClient } from '@/lib/supabase/admin'
import { ScanInviteToggle } from './scan-invite-toggle'
import { AdminTemplate } from '@/components/templates'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ContactsTable } from './contacts-table'

export const dynamic = 'force-dynamic'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'subscribed', label: 'Subscribers' },
  { key: 'beta', label: 'Beta' },
  { key: 'members', label: 'Members' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function applyFilter(rows: ContactCore[], filter: FilterKey): ContactCore[] {
  switch (filter) {
    case 'subscribed': return rows.filter((c) => c.consentState === 'subscribed')
    case 'beta': return rows.filter((c) => c.source === 'beta_waitlist')
    case 'members': return rows.filter((c) => !!c.profileId)
    default: return rows
  }
}

function hrefFor(filter: FilterKey, q: string): string {
  const p = new URLSearchParams()
  if (filter !== 'all') p.set('filter', filter)
  if (q) p.set('q', q)
  const s = p.toString()
  return s ? `/admin/marketing/contacts?${s}` : '/admin/marketing/contacts'
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>
}) {
  const { filter: rawFilter, q: rawQ } = await searchParams
  const filter: FilterKey = (FILTERS.find((f) => f.key === rawFilter)?.key ?? 'all') as FilterKey
  const q = (rawQ ?? '').trim()

  const all = await searchContacts(q, 1000)
  const contacts = applyFilter(all, filter)

  const { data: flagRow } = await createAdminClient()
    .from('platform_flags')
    .select('value')
    .eq('key', 'scan_invite_email_enabled')
    .maybeSingle()
  const scanInviteOn = flagRow?.value ?? false

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Contacts"
      description="The unified CRM record for leads, customers, and members. Email is the join key; members auto-link on signup. Click anyone to see their User Stats: every record about them, grouped, and the path they took through the system."
      width="wide"
    >
      <div className="max-w-md">
        <ScanInviteToggle enabled={scanInviteOn} />
      </div>

      {/* Search — find a scanned/QR person by name or email across the whole CRM. */}
      <form method="get" className="flex items-center gap-2">
        {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search contacts by name or email…"
            className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text outline-none placeholder:text-subtle focus:border-border-strong"
          />
        </div>
        <Button type="submit">Search</Button>
        {q && (
          <Link href={hrefFor(filter, '')} className="text-sm font-medium text-muted hover:text-text">
            Clear
          </Link>
        )}
      </form>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border">
        {FILTERS.map((f) => {
          const active = filter === f.key
          const count = applyFilter(all, f.key).length
          return (
            <Link
              key={f.key}
              href={hrefFor(f.key, q)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active ? 'border-primary text-primary-strong' : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {f.label} <span className="text-subtle">{count}</span>
            </Link>
          )
        })}
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          variant={q ? 'no-results' : 'first-use'}
          title={q ? `No contacts match “${q}”.` : 'No contacts in this view.'}
          description={q ? 'Try a different spelling, or clear the search.' : 'Try a different filter, or contacts will appear here as they arrive.'}
        />
      ) : (
        <ContactsTable contacts={contacts} />
      )}
    </AdminTemplate>
  )
}
