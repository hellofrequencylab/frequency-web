import { listBetaSignups, summarizeBeta, pendingEmailCount, type BetaStatus } from '@/lib/studio/beta'
import { admitBetaSignup, resendBetaConfirm, drainQueueNow } from './actions'
import { AdminTemplate } from '@/components/templates'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

const STATUS_STYLE: Record<BetaStatus, string> = {
  pending: 'bg-warning-bg text-warning',
  confirmed: 'bg-success-bg text-success',
  invited: 'bg-signal-bg text-signal-strong',
  unsubscribed: 'bg-danger-bg text-danger',
}

const STATUS_LABEL: Record<BetaStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  invited: 'Invited',
  unsubscribed: 'Unsubscribed',
}

function fmt(d: string | null): string {
  if (!d) return '-'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function BetaPage() {
  const [signups, queued] = await Promise.all([listBetaSignups(), pendingEmailCount()])
  const stats = summarizeBeta(signups)

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Beta waitlist"
      description="People who asked to join the community Beta. Admit confirmed signups in batches to send them their invite to create an account."
    >
      {queued > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-warning bg-warning-bg/50 px-4 py-3">
          <p className="text-sm text-text">
            <span className="font-semibold">{queued} email{queued === 1 ? '' : 's'} waiting to send.</span>{' '}
            <span className="text-muted">
              If invites/confirmations aren&apos;t arriving, the background sender may not be
              running. Send them now.
            </span>
          </p>
          <form action={drainQueueNow}>
            <Button type="submit" size="sm" className="shrink-0">
              Send queued emails now
            </Button>
          </form>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total.toLocaleString()} />
        <StatCard label="Pending confirm" value={stats.pending.toLocaleString()} />
        <StatCard label="Ready to admit" value={stats.confirmed.toLocaleString()} />
        <StatCard label="Invited" value={stats.invited.toLocaleString()} />
      </div>

      {signups.length === 0 ? (
        <EmptyState title="No beta signups yet." />
      ) : (
        <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-subtle">
                <th className="px-4 py-2.5 font-semibold">Email</th>
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Requested</th>
                <th className="px-4 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {signups.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 text-text">{s.email}</td>
                  <td className="px-4 py-2.5 text-muted">{s.displayName ?? '-'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${STATUS_STYLE[s.status]}`}>
                      {STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{fmt(s.requestedAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {s.status === 'confirmed' && (
                      <form action={admitBetaSignup.bind(null, s.id)} className="inline">
                        <Button type="submit" size="sm">Admit</Button>
                      </form>
                    )}
                    {s.status === 'pending' && (
                      <form action={resendBetaConfirm.bind(null, s.id)} className="inline">
                        <Button type="submit" variant="secondary" size="sm">Resend confirm</Button>
                      </form>
                    )}
                    {s.status === 'invited' && (
                      <span className="text-xs text-subtle">Invited {fmt(s.invitedAt)}</span>
                    )}
                    {s.status === 'unsubscribed' && <span className="text-xs text-subtle">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminTemplate>
  )
}
