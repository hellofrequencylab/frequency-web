import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getCollaboratorEarnings } from '@/lib/partners/collaborator-earnings'
import { formatPriceCents } from '@/lib/commerce/types'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { RowCard } from '@/components/cards/row-card'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

// A private page: what one member's own Journeys earned.
export const metadata: Metadata = {
  title: 'Your Journey earnings',
  robots: { index: false, follow: false },
}

// Collaborator Earnings (LIVE-708). What the signed-in member's paid Journeys actually settled:
// the sale lines on settled orders, after the platform fee and every refund
// (lib/partners/collaborator-earnings.ts). The author's own sales only: no affiliate money
// (LIVE-607). Anyone who authors a Journey can read their own; nobody can read anyone else's.
export default async function CollaboratorEarningsPage() {
  const me = await getCallerProfile()
  if (!me) redirect('/sign-in?next=/partners/collaborators/earnings')

  const e = await getCollaboratorEarnings(me.id)
  const money = (cents: number) => formatPriceCents(cents, e.currency)

  return (
    <DashboardTemplate
      back={{ href: '/partners/collaborators', label: 'Collaborators' }}
      title="Your Journey earnings"
      description="What your paid Journeys settled, after the platform fee and any refunds. Payouts go to your payout account on your usual schedule."
      stats={
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Earned" value={money(e.netCents)} detail="after the platform fee" bordered />
          <StatCard label="Sales" value={e.sales} detail={e.sales === 1 ? 'Journey sold' : 'Journeys sold'} bordered />
          <StatCard label="Platform fee" value={money(e.feeCents)} bordered />
          <StatCard label="Refunded" value={money(e.refundedCents)} bordered />
        </div>
      }
    >
      {e.journeys.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No Journey sales yet"
          description="When someone buys a Journey you made, what it earned shows up here."
        />
      ) : (
        <div className="space-y-2">
          {e.journeys.map((j) => (
            <RowCard
              key={j.planId}
              href={j.slug ? `/journeys/${j.slug}` : undefined}
              title={j.title}
              context={`${j.sales} ${j.sales === 1 ? 'sale' : 'sales'}${j.refundedCents > 0 ? `, ${money(j.refundedCents)} refunded` : ''}`}
              meta={money(j.netCents)}
            />
          ))}
        </div>
      )}
    </DashboardTemplate>
  )
}
