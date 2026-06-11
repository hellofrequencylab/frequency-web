import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import type { ContactRow } from '@/lib/studio/contacts'
import type { BetaSignup, BetaStatus } from '@/lib/studio/beta'

// The Subscribers + Beta lists for the Members surface, on the canonical DataTable
// with the shared StatusChip vocabulary and EmptyState taxonomy (retired the local
// Table/Td/Empty and BETA_STYLE dict, ADR-233 §4).

function fmt(d: string | null): string {
  if (!d) return '—'
  const date = new Date(d)
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const subscriberCols: ColumnDef<ContactRow>[] = [
  { key: 'email', header: 'Email', render: (c) => <span className="text-text">{c.email}</span> },
  { key: 'name', header: 'Name', render: (c) => c.displayName ?? <span className="text-subtle">—</span> },
  { key: 'member', header: 'Member', render: (c) => (c.profileId ? 'Yes' : 'No') },
  { key: 'source', header: 'Source', render: (c) => c.source ?? <span className="text-subtle">—</span> },
  { key: 'joined', header: 'Joined', type: 'date', render: (c) => <span className="tabular-nums">{fmt(c.createdAt)}</span> },
]

export function SubscribersTable({ rows }: { rows: ContactRow[] }) {
  return (
    <DataTable
      caption="Email subscribers"
      rows={rows}
      getRowId={(c) => c.id}
      columns={subscriberCols}
      empty={<EmptyState variant="first-use" title="No subscribers yet" description="Confirmed email subscribers will appear here." />}
    />
  )
}

const BETA_TONE: Record<BetaStatus, StatusTone> = {
  pending: 'warning',
  confirmed: 'success',
  invited: 'info',
  unsubscribed: 'danger',
}

const betaCols: ColumnDef<BetaSignup>[] = [
  { key: 'email', header: 'Email', render: (s) => <span className="text-text">{s.email}</span> },
  { key: 'name', header: 'Name', render: (s) => s.displayName ?? <span className="text-subtle">—</span> },
  {
    key: 'status',
    header: 'Status',
    render: (s) => (
      <StatusChip tone={BETA_TONE[s.status]} size="sm">
        <span className="capitalize">{s.status}</span>
      </StatusChip>
    ),
  },
  { key: 'requested', header: 'Requested', type: 'date', render: (s) => <span className="tabular-nums">{fmt(s.requestedAt)}</span> },
]

export function BetaTable({ rows }: { rows: BetaSignup[] }) {
  return (
    <DataTable
      caption="Beta signups"
      rows={rows}
      getRowId={(s) => s.id}
      columns={betaCols}
      empty={<EmptyState variant="first-use" title="No beta signups yet" description="Waitlist requests will appear here." />}
    />
  )
}
