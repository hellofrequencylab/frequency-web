import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import {
  TOUCH_STATUSES,
  type ControlPanelData,
  type RecipientTouch,
  type TouchStatus,
} from '@/lib/messaging/control-panel'

// The Messaging control panel body (CRM Phase 5, ask #10 — "who got what"). ONE read-only ledger of
// every outbound touch: Space campaign sends (outreach_sends) and broadcast Dispatch fan-outs
// (dispatch_recipients), engagement-upgraded from email_events, with the in-flight async lane
// (notification_queue) summarized beside it. Server-rendered; filters are a plain GET form so the
// panel works without client JS and every filtered view is a shareable URL. Composes the kit
// (StatusChip + EmptyState); semantic tokens only. No em dashes (voice).

const BASE = '/admin/marketing/messaging/control-panel'

/** How each unified status reads: a tone + a glyph, following the presentation legend. */
const STATUS_META: Record<TouchStatus, { tone: StatusTone; glyph: string; label: string }> = {
  queued: { tone: 'info', glyph: '⏳', label: 'Queued' },
  sent: { tone: 'neutral', glyph: '📤', label: 'Sent' },
  delivered: { tone: 'success', glyph: '✅', label: 'Delivered' },
  opened: { tone: 'success', glyph: '👁️', label: 'Opened' },
  clicked: { tone: 'success', glyph: '🔗', label: 'Clicked' },
  bounced: { tone: 'danger', glyph: '🔴', label: 'Bounced' },
  skipped: { tone: 'warning', glyph: '⚠️', label: 'Skipped' },
  suppressed: { tone: 'warning', glyph: '🚫', label: 'Suppressed' },
  failed: { tone: 'danger', glyph: '🔴', label: 'Failed' },
}

function StatusPill({ status }: { status: TouchStatus }) {
  const meta = STATUS_META[status]
  return (
    <StatusChip tone={meta.tone} size="sm">
      <span aria-hidden>{meta.glyph}</span> {meta.label}
    </StatusChip>
  )
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function MessagingControlPanel({ data }: { data: ControlPanelData }) {
  const { touches, filters, refOptions, inFlight } = data
  const hasFilter = Boolean(filters.ref || filters.q || (filters.status && filters.status !== 'all'))

  return (
    <div className="space-y-5">
      {/* Guidance */}
      <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
        <p className="font-semibold text-text">Reading this panel</p>
        <p className="mt-1">
          Every row is one person and one message: a campaign email or a broadcast Dispatch, and where it
          landed. A status moves from Sent to Delivered to Opened to Clicked as the recipient engages.
          Skipped and Suppressed mean the send-gate held the message back (a turned-off preference, a
          missing consent, or a bounced address), so it never left. Filter by campaign, by person, or by
          status to narrow the ledger.
        </p>
      </div>

      {/* In-flight lane */}
      {inFlight.pending + inFlight.processing > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border border-info/30 bg-info-bg/40 px-4 py-3 text-xs text-muted">
          <span className="font-semibold text-info">⏳ In flight</span>
          <span>{inFlight.pending} queued</span>
          <span>{inFlight.processing} sending now</span>
          {inFlight.byKind.slice(0, 4).map((k) => (
            <span key={k.kind} className="text-subtle">
              {k.kind}: {k.count}
            </span>
          ))}
        </div>
      )}

      {/* Filters — a plain GET form so a filtered view is a shareable URL and needs no client JS. */}
      <form method="get" action={BASE} className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <label className="flex flex-col gap-1 text-2xs font-bold uppercase tracking-wide text-subtle">
          Campaign or Dispatch
          <select
            name="ref"
            defaultValue={filters.ref ?? ''}
            className="min-w-[12rem] rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-sm font-normal normal-case text-text"
          >
            <option value="">All messages</option>
            {refOptions.map((o) => (
              <option key={`${o.kind}_${o.id}`} value={o.id}>
                {o.kind === 'dispatch' ? '📡 ' : '✉️ '}
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-2xs font-bold uppercase tracking-wide text-subtle">
          Person
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="name or email"
            className="min-w-[10rem] rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-sm font-normal normal-case text-text"
          />
        </label>
        <label className="flex flex-col gap-1 text-2xs font-bold uppercase tracking-wide text-subtle">
          Status
          <select
            name="status"
            defaultValue={filters.status ?? 'all'}
            className="rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-sm font-normal normal-case text-text"
          >
            <option value="all">Any status</option>
            {TOUCH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClasses('primary', 'sm')}>
          Apply
        </button>
        {hasFilter && (
          <Link href={BASE} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-text">
            Clear
          </Link>
        )}
      </form>

      {/* Ledger */}
      {touches.length === 0 ? (
        <EmptyState
          variant={hasFilter ? 'no-results' : 'first-use'}
          icon={Inbox}
          title={hasFilter ? 'No touches match these filters.' : 'No sends recorded yet.'}
          description={
            hasFilter
              ? 'Try a broader status, a different campaign, or clear the person search.'
              : 'When you send a campaign or publish a Dispatch, every recipient shows up here with where the message landed.'
          }
          action={
            hasFilter ? (
              <Link href={BASE} className="text-sm font-semibold text-primary-strong hover:underline">
                Clear filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <TouchTable touches={touches} />
      )}
    </div>
  )
}

function TouchTable({ touches }: { touches: RecipientTouch[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="bg-surface-elevated text-2xs uppercase tracking-wide text-subtle">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Person</th>
            <th className="px-4 py-2.5 font-semibold">Message</th>
            <th className="px-4 py-2.5 font-semibold">Channel</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 text-right font-semibold">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {touches.map((t) => (
            <tr key={t.id} className="bg-surface hover:bg-surface-elevated/50">
              <td className="px-4 py-2.5 font-medium text-text">{t.recipient}</td>
              <td className="px-4 py-2.5 text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden>{t.source === 'dispatch' ? '📡' : '✉️'}</span>
                  <span className="truncate">{t.refLabel ?? (t.source === 'dispatch' ? 'Dispatch' : 'Campaign')}</span>
                </span>
              </td>
              <td className="px-4 py-2.5 text-muted capitalize">{t.channel}</td>
              <td className="px-4 py-2.5">
                <span className="inline-flex flex-col gap-0.5">
                  <StatusPill status={t.status} />
                  {t.reason && <span className="text-2xs text-subtle">{t.reason}</span>}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-subtle" title={t.at}>
                {relTime(t.at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
