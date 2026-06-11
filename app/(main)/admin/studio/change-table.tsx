'use client'

import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { RevertButton } from './recommendation-card'

// The governed change log rendered through the canonical DataTable (ADR-233 §3.3).
// Status maps to the one StatusChip vocabulary; applied + reversible rows expose Revert
// as a hover row action.

export interface ChangeRowData {
  id: string
  label: string
  reversible: boolean
  actor: string
  status: string
  detail: string | null
  createdAt: string
}

const STATUS_TONE: Record<string, StatusTone> = {
  applied: 'success',
  reverted: 'neutral',
}
const statusTone = (s: string): StatusTone => STATUS_TONE[s] ?? 'danger'

export function StudioChangeTable({ rows }: { rows: ChangeRowData[] }) {
  const columns: ColumnDef<ChangeRowData>[] = [
    { key: 'label', header: 'Change', render: (r) => <span className="font-medium text-text">{r.label}</span> },
    {
      key: 'who',
      header: 'Who & when',
      render: (r) => (
        <span className="text-muted">
          {r.actor} · {new Date(r.createdAt).toLocaleString()}
          {r.detail ? ` · ${r.detail}` : ''}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (r) => (
        <StatusChip tone={statusTone(r.status)} size="sm">
          {r.status}
        </StatusChip>
      ),
    },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id}
      caption="Governed changes applied in the studio, newest first"
      density="compact"
      rowActions={(r) => (r.status === 'applied' && r.reversible ? <RevertButton logId={r.id} /> : null)}
    />
  )
}
