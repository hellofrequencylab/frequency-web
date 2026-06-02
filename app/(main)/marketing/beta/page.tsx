import { listBetaSignups, summarizeBeta, pendingEmailCount, type BetaStatus } from '@/lib/studio/beta'
import { admitBetaSignup, resendBetaConfirm, drainQueueNow } from './actions'

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
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Beta waitlist</h1>
      <p className="text-sm text-muted leading-relaxed max-w-2xl mb-6">
        People who asked to join the community Beta. Admit confirmed signups in
        batches to send them their invite to create an account.
      </p>

      {queued > 0 && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-warning bg-warning-bg/50 px-4 py-3">
          <p className="text-sm text-text">
            <span className="font-semibold">{queued} email{queued === 1 ? '' : 's'} waiting to send.</span>{' '}
            <span className="text-muted">
              If invites/confirmations aren&apos;t arriving, the background sender may not be
              running. Send them now.
            </span>
          </p>
          <form action={drainQueueNow}>
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-primary text-on-primary px-3.5 py-1.5 text-xs font-semibold hover:bg-primary-hover transition-colors"
            >
              Send queued emails now
            </button>
          </form>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Total" value={stats.total} />
        <Stat label="Pending confirm" value={stats.pending} tone="warning" />
        <Stat label="Ready to admit" value={stats.confirmed} tone="success" />
        <Stat label="Invited" value={stats.invited} tone="signal" />
      </div>

      {signups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-10 text-center">
          <p className="text-sm text-muted">No beta signups yet.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
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
                        <button
                          type="submit"
                          className="rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary-hover transition-colors"
                        >
                          Admit
                        </button>
                      </form>
                    )}
                    {s.status === 'pending' && (
                      <form action={resendBetaConfirm.bind(null, s.id)} className="inline">
                        <button
                          type="submit"
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text hover:border-border-strong transition-colors"
                        >
                          Resend confirm
                        </button>
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
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'warning' | 'success' | 'signal'
}) {
  const accent =
    tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : tone === 'signal' ? 'text-signal-strong' : 'text-text'
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3.5">
      <p className={`text-2xl font-bold ${accent}`}>{value.toLocaleString()}</p>
      <p className="text-xs uppercase tracking-wider text-subtle mt-1 font-semibold">{label}</p>
    </div>
  )
}
