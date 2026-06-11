'use client'

import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import type { CampaignRow } from '@/lib/studio/campaigns'

// Campaign status -> the one StatusChip vocabulary.
function statusTone(status: string): StatusTone {
  const s = status.toLowerCase()
  if (s === 'sent' || s === 'delivered') return 'success'
  if (s === 'sending' || s === 'queued' || s === 'scheduled') return 'info'
  if (s === 'failed' || s === 'error') return 'danger'
  if (s === 'draft') return 'neutral'
  return 'neutral'
}

// Sent campaigns as the canonical operator table (ADR-233 §3 Index/Table).
export function CampaignsTable({ campaigns }: { campaigns: CampaignRow[] }) {
  const columns: ColumnDef<CampaignRow>[] = [
    { key: 'subject', header: 'Subject', render: (c) => <span className="font-medium text-text">{c.subject}</span> },
    { key: 'segment', header: 'Segment', render: (c) => <span className="text-muted">{c.segment}</span> },
    {
      key: 'status',
      header: 'Status',
      type: 'tag',
      render: (c) => (
        <StatusChip tone={statusTone(c.status)}>
          <span className="capitalize">{c.status}</span>
        </StatusChip>
      ),
    },
    { key: 'recipientCount', header: 'Sent', type: 'number', sortable: true, render: (c) => c.recipientCount.toLocaleString() },
  ]

  return <DataTable caption="Sent campaigns" rows={campaigns} columns={columns} getRowId={(c) => c.id} />
}
