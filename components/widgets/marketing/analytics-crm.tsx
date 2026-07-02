import { getEmailStats, getStudioCounts } from '@/lib/studio/analytics'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'

// Marketing analytics layout module (ADR-270/294): the CRM counts — contacts, campaigns, and
// suppressed addresses, each linking into its workspace. Self-fetching RSC; always renders (the
// counts are the signal even at zero).
export async function MarketingAnalyticsCrm() {
  const [email, counts] = await Promise.all([getEmailStats(30), getStudioCounts()])

  return (
    <AdminSection title="CRM">
      <div className="grid grid-cols-2 gap-3.5 @2xl:grid-cols-4">
        <StatCard label="Contacts" value={counts.contacts.toLocaleString()} href="/admin/marketing/contacts" />
        <StatCard label="Campaigns" value={counts.campaigns.toLocaleString()} href="/admin/marketing/campaigns" />
        <StatCard label="Suppressed" value={email.suppressed.toLocaleString()} />
      </div>
    </AdminSection>
  )
}
