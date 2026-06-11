'use client'

import { Button } from '@/components/ui/button'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import type { BetaSignup, BetaStatus } from '@/lib/studio/beta'
import { admitBetaSignup, resendBetaConfirm } from './actions'

const STATUS: Record<BetaStatus, { tone: StatusTone; label: string }> = {
  pending: { tone: 'warning', label: 'Pending' },
  confirmed: { tone: 'success', label: 'Confirmed' },
  invited: { tone: 'info', label: 'Invited' },
  unsubscribed: { tone: 'danger', label: 'Unsubscribed' },
}

function fmt(d: string | null): string {
  if (!d) return '–'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '–'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// The Beta waitlist as the canonical operator table (ADR-233 §3 Index/Table). Status
// speaks the one StatusChip vocabulary (the old STATUS_STYLE/STATUS_LABEL dicts are
// retired); each row's primary action is a server-action form in the actions column.
export function BetaTable({ signups }: { signups: BetaSignup[] }) {
  const columns: ColumnDef<BetaSignup>[] = [
    { key: 'email', header: 'Email', render: (s) => <span className="font-medium text-text">{s.email}</span> },
    { key: 'displayName', header: 'Name', render: (s) => <span className="text-muted">{s.displayName ?? '–'}</span> },
    {
      key: 'status',
      header: 'Status',
      type: 'tag',
      render: (s) => <StatusChip tone={STATUS[s.status].tone}>{STATUS[s.status].label}</StatusChip>,
    },
    { key: 'requestedAt', header: 'Requested', type: 'date', render: (s) => <span className="text-muted">{fmt(s.requestedAt)}</span> },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      render: (s) => {
        if (s.status === 'confirmed') {
          return (
            <form action={admitBetaSignup.bind(null, s.id)} className="inline">
              <Button type="submit" size="sm">Admit</Button>
            </form>
          )
        }
        if (s.status === 'pending') {
          return (
            <form action={resendBetaConfirm.bind(null, s.id)} className="inline">
              <Button type="submit" variant="secondary" size="sm">Resend confirm</Button>
            </form>
          )
        }
        if (s.status === 'invited') {
          return <span className="text-xs text-subtle">Invited {fmt(s.invitedAt)}</span>
        }
        return <span className="text-xs text-subtle">–</span>
      },
    },
  ]

  return <DataTable caption="Beta waitlist" rows={signups} columns={columns} getRowId={(s) => s.id} />
}
