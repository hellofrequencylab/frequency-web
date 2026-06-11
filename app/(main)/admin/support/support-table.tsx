import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip } from '@/components/admin/status'
import { relativeTime } from '@/lib/utils'
import { STATUS_LABELS, PRIORITY_LABELS, TYPE_LABELS } from '@/lib/support/types'
import type { AdminTicketRow } from '@/lib/support/store'
import { STATUS_TONE, PRIORITY_TONE } from './support-chips'

// The triage queue on the canonical DataTable (ADR-233 §4) with the shared StatusChip
// vocabulary (retired the statusChipClass/priorityChipClass inline pills). Whole-row
// link into the ticket workspace; tabular activity column.

const columns: ColumnDef<AdminTicketRow>[] = [
  {
    key: 'subject',
    header: 'Subject',
    render: (t) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium text-text">{t.subject}</span>
        <span className="block truncate text-xs text-subtle">
          {TYPE_LABELS[t.type]} · #{t.ref} · {t.reporter?.name ?? 'Unknown'}
          {t.assignee && <> · → {t.assignee.name}</>}
        </span>
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (t) => (
      <StatusChip tone={STATUS_TONE[t.status]} size="sm">{STATUS_LABELS[t.status]}</StatusChip>
    ),
  },
  {
    key: 'priority',
    header: 'Priority',
    render: (t) => (
      <StatusChip tone={PRIORITY_TONE[t.priority]} size="sm">{PRIORITY_LABELS[t.priority]}</StatusChip>
    ),
  },
  {
    key: 'messages',
    header: 'Messages',
    type: 'number',
    render: (t) => <span className="tabular-nums">{t.replyCount}</span>,
  },
  {
    key: 'activity',
    header: 'Last activity',
    align: 'right',
    render: (t) => <span className="tabular-nums text-muted">{relativeTime(t.lastActivityAt)}</span>,
  },
]

export function SupportTable({ tickets, empty }: { tickets: AdminTicketRow[]; empty: React.ReactNode }) {
  return (
    <DataTable
      caption="Support tickets"
      rows={tickets}
      getRowId={(t) => t.id}
      rowHref={(t) => `/admin/support/${t.id}`}
      columns={columns}
      empty={empty}
    />
  )
}
