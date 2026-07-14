// The Messaging control panel (CRM Master Build Plan §Phase 5, ask #10 — the unified "who-got-what").
// ONE read-only view over the four ledgers that already record every outbound touch: campaign email
// sends (outreach_sends), broadcast Dispatch fan-outs (dispatch_recipients), engagement from
// email_events, and the in-flight async lane (notification_queue). It answers "what is going / went
// to whom" without a new send path. Composes the kit (AdminTemplate + StatCard + AdminSection). The
// filters are query params, so a filtered view is a shareable URL. Gate: marketing staff, re-checked
// here (the page reads the admin client, so the gate stays the authority).

import { Send, Users, MailCheck, MousePointerClick, AlertTriangle, Clock } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { requireAdmin } from '@/lib/admin/guard'
import { getControlPanel, type TouchStatus } from '@/lib/messaging/control-panel'
import { MessagingControlPanel } from '@/components/admin/messaging/control-panel'

export const dynamic = 'force-dynamic'

/** Coerce a raw query-param value to a single trimmed string, or null. */
function one(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) v = v[0]
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}

export default async function MessagingControlPanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin('admin', { staff: 'marketing' })
  const sp = await searchParams

  const data = await getControlPanel({
    ref: one(sp.ref),
    q: one(sp.q),
    status: (one(sp.status) as TouchStatus | 'all' | null) ?? null,
  })
  const { counts } = data

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Control panel"
      icon={Send}
      width="wide"
      description="Who got what. Every campaign email and every broadcast Dispatch, per recipient, with where the message landed. This is a read-only ledger: it reports what the send-gate already did, it never sends anything itself."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Recipients" value={counts.recipients.toLocaleString()} icon={Users} detail="in this view" />
        <StatCard label="Delivered" value={counts.delivered.toLocaleString()} icon={MailCheck} />
        <StatCard label="Opened" value={counts.opened.toLocaleString()} icon={MailCheck} />
        <StatCard label="Clicked" value={counts.clicked.toLocaleString()} icon={MousePointerClick} />
        <StatCard label="Held back" value={counts.skipped.toLocaleString()} icon={AlertTriangle} detail="skipped or suppressed" />
        <StatCard label="In flight" value={counts.inFlight.toLocaleString()} icon={Clock} />
      </div>

      <AdminSection
        title="Recipient ledger"
        description="Each row is one person and one message. Filter by campaign, by person, or by status."
      >
        <MessagingControlPanel data={data} />
      </AdminSection>
    </AdminTemplate>
  )
}
