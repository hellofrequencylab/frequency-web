import Link from 'next/link'
import { Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Studio dashboard (placeholder). Module cards fill in as Phase 6.4+ lands.
export default function StudioDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Studio</h1>
      <p className="text-sm text-muted leading-relaxed max-w-2xl mb-6">
        The business cockpit. Contacts, campaigns, automations, analytics, and the AI
        operator live here. Everything sends through the one spine and reads from the
        one event backbone.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <Link
          href="/studio/contacts"
          className="rounded-2xl border border-border bg-surface shadow-sm p-4 hover:border-primary-bg transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary-strong" />
            <h2 className="text-sm font-semibold text-text">Contacts</h2>
          </div>
          <p className="text-xs text-muted">The unified CRM record for leads, customers, and members.</p>
        </Link>
      </div>
    </div>
  )
}
