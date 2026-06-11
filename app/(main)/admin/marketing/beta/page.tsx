import { listBetaSignups, summarizeBeta, pendingEmailCount } from '@/lib/studio/beta'
import { drainQueueNow } from './actions'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Banner } from '@/components/admin/status'
import { BetaTable } from './beta-table'

export const dynamic = 'force-dynamic'

export default async function BetaPage() {
  const [signups, queued] = await Promise.all([listBetaSignups(), pendingEmailCount()])
  const stats = summarizeBeta(signups)

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Beta waitlist"
      description="People who asked to join the community Beta. Admit confirmed signups in batches to send them their invite to create an account."
      width="wide"
    >
      {queued > 0 && (
        <Banner
          tone="warning"
          title={`${queued} email${queued === 1 ? '' : 's'} waiting to send.`}
          action={
            <form action={drainQueueNow}>
              <Button type="submit" size="sm">Send queued emails now</Button>
            </form>
          }
        >
          If invites or confirmations aren’t arriving, the background sender may not be running. Send them now.
        </Banner>
      )}

      <AdminSection title="At a glance">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <StatCard label="Total" value={stats.total.toLocaleString()} />
          <StatCard label="Pending confirm" value={stats.pending.toLocaleString()} />
          <StatCard label="Ready to admit" value={stats.confirmed.toLocaleString()} />
          <StatCard label="Invited" value={stats.invited.toLocaleString()} />
        </div>
      </AdminSection>

      <AdminSection title="Signups">
        {signups.length === 0 ? (
          <EmptyState variant="first-use" title="No beta signups yet." description="As people raise a hand for the Beta, they will appear here." />
        ) : (
          <BetaTable signups={signups} />
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
