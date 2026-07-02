'use client'

import { useState, useTransition } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import type { AutomationActionType, AutomationRule } from '@/lib/automations'
import { toggleRule, deleteRule } from './actions'
import { RuleForm, type EditableRule } from './rule-form'

// The enabled/disabled toggle. Runs toggleRule in a transition and surfaces a
// failed write inline (the action returns { ok, error }) instead of the old native
// <form action> that swallowed it and looked like it had flipped.
function ToggleCell({ rule }: { rule: AutomationRule }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          start(async () => {
            const res = await toggleRule(rule.id, !rule.enabled)
            if (!res.ok) setError(res.error ?? 'Could not update the rule.')
          })
        }}
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
          rule.enabled
            ? 'bg-success-bg text-success hover:bg-surface-elevated'
            : 'bg-surface-elevated text-muted hover:bg-primary-bg hover:text-primary-strong'
        }`}
      >
        {rule.enabled ? 'Enabled' : 'Disabled'}
      </button>
      {error && <p role="alert" className="mt-1 text-2xs font-medium text-danger">{error}</p>}
    </div>
  )
}

// The delete button. Mirrors ToggleCell: runs deleteRule in a transition and surfaces a failed
// delete inline (the action returns { ok, error }) instead of the old fire-and-forget that
// swallowed the error and looked like the row was gone until a refresh brought it back.
function DeleteCell({ rule }: { rule: AutomationRule }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete the automation "${rule.name}"? This cannot be undone.`)) return
          setError(null)
          start(async () => {
            const res = await deleteRule(rule.id)
            if (!res.ok) setError(res.error ?? 'Could not delete the rule.')
          })
        }}
        aria-label="Delete rule"
        className="rounded-lg p-1.5 text-subtle hover:bg-danger-bg hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {error && <p role="alert" className="mt-1 text-2xs font-medium text-danger">{error}</p>}
    </div>
  )
}

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
      render: (r) => <ToggleCell rule={r} />,
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
          <DeleteCell rule={r} />
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
