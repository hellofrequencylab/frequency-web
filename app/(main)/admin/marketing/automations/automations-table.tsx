'use client'

import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import type { AutomationRule } from '@/lib/automations'
import { toggleRule } from './actions'

// Automation rules as the canonical operator table (ADR-233 §3 Index/Table). The
// enabled toggle is a server-action form in the actions column (the old inline pill
// styling is retired in favor of a tokenized switch button).
export function AutomationsTable({ rules }: { rules: AutomationRule[] }) {
  const columns: ColumnDef<AutomationRule>[] = [
    { key: 'name', header: 'Rule', render: (r) => <span className="font-medium text-text">{r.name}</span> },
    {
      key: 'triggerEvent',
      header: 'Trigger',
      render: (r) => (
        <span className="text-muted">
          on <code className="rounded bg-surface-elevated px-1 py-0.5 text-xs text-text">{r.triggerEvent}</code> · email member
        </span>
      ),
    },
    {
      key: 'enabled',
      header: 'State',
      align: 'right',
      render: (r) => (
        <form action={toggleRule.bind(null, r.id, !r.enabled)} className="inline">
          <button
            type="submit"
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
              r.enabled
                ? 'bg-success-bg text-success hover:bg-surface-elevated'
                : 'bg-surface-elevated text-muted hover:bg-primary-bg hover:text-primary-strong'
            }`}
          >
            {r.enabled ? 'Enabled' : 'Disabled'}
          </button>
        </form>
      ),
    },
  ]

  return <DataTable caption="Automation rules" rows={rules} columns={columns} getRowId={(r) => r.id} />
}
