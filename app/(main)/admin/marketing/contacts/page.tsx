import { searchContacts, type ContactCore } from '@/lib/crm/person'
import { createAdminClient } from '@/lib/supabase/admin'
import { ScanInviteToggle } from './scan-invite-toggle'
import { AdminTemplate } from '@/components/templates'
import { FilterBar } from '@/components/admin/filter-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { ContactsTable } from './contacts-table'

export const dynamic = 'force-dynamic'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'leads', label: 'Leads' },
  { key: 'subscribed', label: 'Subscribers' },
  { key: 'beta', label: 'Beta' },
  { key: 'members', label: 'Members' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function applyFilter(rows: ContactCore[], filter: FilterKey): ContactCore[] {
  switch (filter) {
    // A LEAD is a contact who has not signed up yet (no linked member profile) — the people an import
    // brings in. They auto-link to a profile on signup, at which point they read as a Member.
    case 'leads': return rows.filter((c) => !c.profileId)
    case 'subscribed': return rows.filter((c) => c.consentState === 'subscribed')
    case 'beta': return rows.filter((c) => c.source === 'beta_waitlist')
    case 'members': return rows.filter((c) => !!c.profileId)
    default: return rows
  }
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

      {/* URL-state search + segment filter — find a scanned/QR person by name or
          email, or narrow to a segment, across the whole CRM. */}
      <FilterBar
        search="q"
        searchPlaceholder="Search contacts by name or email…"
        filters={[
          {
            key: 'filter',
            label: 'Segment',
            options: FILTERS.filter((f) => f.key !== 'all').map((f) => ({ value: f.key, label: f.label })),
          },
        ]}
      />

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
