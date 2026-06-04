import Link from 'next/link'
import { listContacts, type ContactRow } from '@/lib/studio/contacts'
import { setContactConsent } from './actions'

export const dynamic = 'force-dynamic'

const CONSENT_STYLE: Record<string, string> = {
  subscribed: 'bg-success-bg text-success',
  unsubscribed: 'bg-danger-bg text-danger',
  unknown: 'bg-surface-elevated text-muted',
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'subscribed', label: 'Subscribers' },
  { key: 'beta', label: 'Beta' },
  { key: 'members', label: 'Members' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function applyFilter(rows: ContactRow[], filter: FilterKey): ContactRow[] {
  switch (filter) {
    case 'subscribed': return rows.filter((c) => c.consentState === 'subscribed')
    case 'beta': return rows.filter((c) => c.source === 'beta_waitlist')
    case 'members': return rows.filter((c) => !!c.profileId)
    default: return rows
  }
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter: rawFilter } = await searchParams
  const filter: FilterKey = (FILTERS.find((f) => f.key === rawFilter)?.key ?? 'all') as FilterKey

  const all = await listContacts(1000)
  const contacts = applyFilter(all, filter)

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Contacts</h1>
      <p className="text-sm text-muted leading-relaxed max-w-2xl mb-5">
        The unified CRM record for leads, customers, and members. Email is the join
        key; members auto-link on signup.
      </p>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border mb-5">
        {FILTERS.map((f) => {
          const active = filter === f.key
          const count = applyFilter(all, f.key).length
          const href = f.key === 'all' ? '/marketing/contacts' : `/marketing/contacts?filter=${f.key}`
          return (
            <Link
              key={f.key}
              href={href}
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
        <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-10 text-center">
          <p className="text-sm text-muted">No contacts in this view.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-subtle">
                <th className="px-4 py-2.5 font-semibold">Email</th>
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">Member</th>
                <th className="px-4 py-2.5 font-semibold">Source</th>
                <th className="px-4 py-2.5 font-semibold">Consent</th>
                <th className="px-4 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 text-text">{c.email}</td>
                  <td className="px-4 py-2.5 text-muted">{c.displayName ?? '-'}</td>
                  <td className="px-4 py-2.5 text-muted">
                    {c.profileId ? (
                      <Link href="/admin/members" className="text-primary-strong hover:underline">Yes</Link>
                    ) : 'No'}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{c.source ?? '-'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${CONSENT_STYLE[c.consentState] ?? CONSENT_STYLE.unknown}`}>
                      {c.consentState}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {c.consentState === 'subscribed' ? (
                      <form action={setContactConsent.bind(null, c.id, 'unsubscribed')} className="inline">
                        <button type="submit" className="text-xs font-semibold text-danger hover:underline">
                          Unsubscribe
                        </button>
                      </form>
                    ) : c.consentState === 'unsubscribed' ? (
                      <form action={setContactConsent.bind(null, c.id, 'subscribed')} className="inline">
                        <button type="submit" className="text-xs font-semibold text-muted hover:text-text hover:underline">
                          Resubscribe
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-subtle">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
