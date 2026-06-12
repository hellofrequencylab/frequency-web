import Link from 'next/link'
import { Share2, UserPlus, Zap, CircleCheck, Hourglass, Percent } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { getReferralStats, type ReferrerRow } from '@/lib/referral/stats'

export const dynamic = 'force-dynamic'

// The referral funnel dashboard — the observability for the personal-code program.
// Shows the funnel (signups -> activated -> Zaps paid), who is driving it, and recent
// payouts. The on/off switch + reward amount live elsewhere (onboarding-controls /
// gamification); this is the read-only "is it working" view.
export default async function ReferralsPage() {
  await requireAdmin('host', { staff: 'marketing' })
  const stats = await getReferralStats()

  const fmtWhen = (s: string | null) =>
    s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

  const columns: ColumnDef<ReferrerRow>[] = [
    {
      key: 'name',
      header: 'Member',
      render: (r) =>
        r.handle ? (
          <Link href={`/people/${r.handle}`} className="font-medium text-text hover:underline">
            {r.name}
          </Link>
        ) : (
          <span className="font-medium text-text">{r.name}</span>
        ),
    },
    { key: 'signups', header: 'Brought', type: 'number', render: (r) => r.signups.toLocaleString() },
    {
      key: 'activated',
      header: 'Activated',
      type: 'number',
      render: (r) => <span className="font-semibold text-text">{r.activated.toLocaleString()}</span>,
    },
    { key: 'zaps', header: 'Zaps earned', type: 'number', render: (r) => r.zaps.toLocaleString() },
  ]

  return (
    <AdminTemplate
      title="Referrals"
      icon={Share2}
      eyebrow="Acquisition"
      width="wide"
      description="The personal-code referral funnel. Members share their code, it lands a scanner on the splash, and the referrer earns Zaps once the person they brought activates."
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard bordered icon={UserPlus} label="Referred signups" value={stats.signups.toLocaleString()} />
          <StatCard bordered icon={CircleCheck} label="Activated" value={stats.activated.toLocaleString()} />
          <StatCard bordered icon={Hourglass} label="Pending" value={stats.pending.toLocaleString()} />
          <StatCard
            bordered
            icon={Percent}
            label="Activation rate"
            value={stats.conversionPct == null ? '–' : `${stats.conversionPct}%`}
          />
          <StatCard bordered icon={Zap} label="Zaps paid out" value={stats.zapsPaid.toLocaleString()} />
        </div>
        <p className="mt-3 text-sm text-muted">
          Referrers are paid on activation (the person they brought joins a circle or logs a practice), not on signup, so the
          reward tracks real members. The on/off switch lives in{' '}
          <Link href="/admin/onboarding-controls" className="font-medium text-primary-strong hover:underline">
            Onboarding &amp; referral controls
          </Link>{' '}
          and the reward amount in{' '}
          <Link href="/admin/gamification" className="font-medium text-primary-strong hover:underline">
            Rewards
          </Link>
          .
        </p>
      </AdminSection>

      <AdminSection title="Top referrers" description="Who is bringing the most members, and how many have activated.">
        <DataTable
          rows={stats.topReferrers}
          getRowId={(r) => r.profileId}
          columns={columns}
          caption="Members ranked by activated referrals."
          empty={
            <EmptyState
              variant="first-use"
              icon={Share2}
              title="No referrals yet"
              description="They appear here as members share their personal code and the people they bring sign up."
            />
          }
        />
      </AdminSection>

      {stats.recent.length > 0 && (
        <AdminSection title="Recent activations" description="The latest referrer payouts.">
          <ul className="space-y-2">
            {stats.recent.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-text">
                  {e.handle ? (
                    <Link href={`/people/${e.handle}`} className="font-medium hover:underline">
                      {e.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{e.name}</span>
                  )}
                  <span className="text-muted"> earned a referral reward</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-subtle">{fmtWhen(e.at)}</span>
              </li>
            ))}
          </ul>
        </AdminSection>
      )}
    </AdminTemplate>
  )
}
