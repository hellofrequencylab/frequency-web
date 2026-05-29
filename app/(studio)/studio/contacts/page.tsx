import { listContacts } from '@/lib/studio/contacts'

export const dynamic = 'force-dynamic'

const CONSENT_STYLE: Record<string, string> = {
  subscribed: 'bg-success-bg text-success',
  unsubscribed: 'bg-danger-bg text-danger',
  unknown: 'bg-surface-elevated text-muted',
}

export default async function ContactsPage() {
  const contacts = await listContacts()

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Contacts</h1>
      <p className="text-sm text-muted leading-relaxed max-w-2xl mb-6">
        The unified CRM record for leads, customers, and members. Email is the join
        key; members auto-link on signup. {contacts.length} total.
      </p>

      {contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-10 text-center">
          <p className="text-sm text-muted">No contacts yet.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-subtle">
                <th className="px-4 py-2.5 font-semibold">Email</th>
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">Member</th>
                <th className="px-4 py-2.5 font-semibold">Consent</th>
                <th className="px-4 py-2.5 font-semibold text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 text-text">{c.email}</td>
                  <td className="px-4 py-2.5 text-muted">{c.displayName ?? '-'}</td>
                  <td className="px-4 py-2.5 text-muted">{c.profileId ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium ${CONSENT_STYLE[c.consentState] ?? CONSENT_STYLE.unknown}`}>
                      {c.consentState}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted">{c.engagementScore.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
