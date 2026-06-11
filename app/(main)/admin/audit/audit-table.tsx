'use client'

import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'

// The audit trail rendered through the canonical DataTable (ADR-233 §3.3). The
// ACTION_LABEL map is CONTENT — the human reading of each dotted action key — and is the
// one dictionary this surface keeps. Its KIND (moderation / role / persona / demo) is
// rendered as a StatusChip so the trail scans by category without a bespoke pill.

export interface AuditRowData {
  id: string
  action: string
  actor: string
  targetType: string | null
  targetId: string | null
  detail: Record<string, unknown>
  createdAt: string
}

const ACTION_LABEL: Record<string, string> = {
  'role.assign': 'Assigned a role',
  'persona.verified': 'Verified a partner persona',
  'persona.active': 'Activated a partner persona',
  'persona.suspended': 'Suspended a partner persona',
  'moderation.hide': 'Hid reported content',
  'moderation.dismiss': 'Dismissed a report',
  'moderation.warn': 'Warned a member',
  'moderation.suspend': 'Suspended a member',
  'moderation.event_cancel': 'Cancelled a reported event',
  'demo.purge': 'Purged demo content',
}
const label = (a: string) => ACTION_LABEL[a] ?? a

// The action's family → a tone so the trail reads by category (color = kind, not
// severity here — these are all completed records).
const KIND_TONE: Record<string, StatusTone> = {
  role: 'info',
  persona: 'success',
  moderation: 'warning',
  demo: 'danger',
}
const kind = (a: string) => a.split('.')[0]
const kindTone = (a: string): StatusTone => KIND_TONE[kind(a)] ?? 'neutral'

function detailText(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ')
}

export function AuditTable({ rows }: { rows: AuditRowData[] }) {
  const columns: ColumnDef<AuditRowData>[] = [
    {
      key: 'action',
      header: 'Action',
      render: (r) => (
        <div className="flex items-center gap-2">
          <StatusChip tone={kindTone(r.action)} size="sm">
            {kind(r.action)}
          </StatusChip>
          <span className="font-medium text-text">{label(r.action)}</span>
        </div>
      ),
    },
    { key: 'actor', header: 'Actor', render: (r) => <span className="text-muted">{r.actor}</span> },
    {
      key: 'target',
      header: 'Target',
      render: (r) =>
        r.targetType ? (
          <span className="text-muted">
            {r.targetType}
            {r.targetId ? `:${r.targetId.slice(0, 8)}` : ''}
          </span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      key: 'detail',
      header: 'Detail',
      render: (r) =>
        Object.keys(r.detail).length ? (
          <span className="text-muted">{detailText(r.detail)}</span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'When',
      type: 'date',
      align: 'right',
      render: (r) => <span className="text-subtle">{new Date(r.createdAt).toLocaleString()}</span>,
    },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id}
      caption="Sensitive platform actions, newest first"
      density="compact"
      stickyHeader
    />
  )
}
