'use client'

import { useState, useTransition } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import type { AutomationActionType, AutomationRule } from '@/lib/automations'
import { toggleRule, deleteRule } from './actions'
import { RuleForm, type EditableRule } from './rule-form'

// Operator-facing verb for each action type. Falls back to the raw type for any
// value the table doesn't recognize yet.
function actionLabel(actionType: string): string {
  switch (actionType) {
    case 'email_actor':
      return 'email'
    case 'push_actor':
      return 'push'
    default:
      return actionType
  }
}

// Flatten a stored rule into the form's editable shape (the form keeps email/push
// fields separate; action_config stores only the ones for its action_type).
function toEditable(r: AutomationRule): EditableRule {
  const cfg = r.actionConfig
  return {
    id: r.id,
    name: r.name,
    triggerEvent: r.triggerEvent,
    actionType: (r.actionType as AutomationActionType) ?? 'email_actor',
    subject: typeof cfg.subject === 'string' ? cfg.subject : '',
    body: typeof cfg.body === 'string' ? cfg.body : '',
    pushTitle: typeof cfg.title === 'string' ? cfg.title : '',
    pushBody: typeof cfg.body === 'string' && r.actionType === 'push_actor' ? cfg.body : '',
    pushUrl: typeof cfg.url === 'string' ? cfg.url : '',
    conditions: r.conditions,
  }
}

// Automation rules as the canonical operator table (ADR-233 §3 Index/Table). The
// enabled toggle, edit, and delete all run server actions re-gated server-side.
export function AutomationsTable({
  rules,
  triggers,
}: {
  rules: AutomationRule[]
  triggers: readonly string[]
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDelete, startDelete] = useTransition()

  const columns: ColumnDef<AutomationRule>[] = [
    { key: 'name', header: 'Rule', render: (r) => <span className="font-medium text-text">{r.name}</span> },
    {
      key: 'triggerEvent',
      header: 'Trigger',
      render: (r) => (
        <span className="text-muted">
          on <code className="rounded bg-surface-elevated px-1 py-0.5 text-xs text-text">{r.triggerEvent}</code>
          {r.conditions.length > 0 && (
            <>
              {' '}· {r.conditions.length} condition{r.conditions.length === 1 ? '' : 's'}
            </>
          )}
          {' '}· {actionLabel(r.actionType)} member
        </span>
      ),
    },
    {
      key: 'enabled',
      header: 'State',
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
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditingId((id) => (id === r.id ? null : r.id))}
            aria-label="Edit rule"
            className="rounded-lg p-1.5 text-subtle hover:bg-surface-elevated hover:text-text"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={pendingDelete}
            onClick={() => {
              if (!confirm(`Delete the automation "${r.name}"? This cannot be undone.`)) return
              startDelete(async () => {
                await deleteRule(r.id)
              })
            }}
            aria-label="Delete rule"
            className="rounded-lg p-1.5 text-subtle hover:bg-danger-bg hover:text-danger disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  const editing = editingId ? rules.find((r) => r.id === editingId) : null

  return (
    <div className="space-y-4">
      <DataTable caption="Automation rules" rows={rules} columns={columns} getRowId={(r) => r.id} />
      {editing && (
        <RuleForm
          triggers={triggers}
          rule={toEditable(editing)}
          onDone={() => setEditingId(null)}
        />
      )}
    </div>
  )
}
