import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import type { ContactRow } from '@/lib/studio/contacts'

// The Subscribers list for the Members surface, on the canonical DataTable with the
// shared StatusChip vocabulary and EmptyState taxonomy (retired the local
// Table/Td/Empty and BETA_STYLE dict, ADR-233 §4). A Beta signups table sat beside it
// until the beta waitlist was removed.

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
