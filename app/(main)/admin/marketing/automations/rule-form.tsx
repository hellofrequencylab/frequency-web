'use client'

import { useState, useTransition } from 'react'
import { Plus, Check, AlertCircle, X } from 'lucide-react'
import type {
  AutomationActionType,
  AutomationCondition,
  AutomationConditionOp,
} from '@/lib/automations'
import { createRule, editRule, type RuleResult } from './actions'

const CHANNELS: { value: AutomationActionType; label: string }[] = [
  { value: 'email_actor', label: 'Email' },
  { value: 'push_actor', label: 'Push' },
]

const OPS: { value: AutomationConditionOp; label: string; needsValue: boolean }[] = [
  { value: 'eq', label: 'equals', needsValue: true },
  { value: 'neq', label: 'does not equal', needsValue: true },
  { value: 'gt', label: 'greater than', needsValue: true },
  { value: 'lt', label: 'less than', needsValue: true },
  { value: 'exists', label: 'is present', needsValue: false },
  { value: 'absent', label: 'is missing', needsValue: false },
]

function opNeedsValue(op: AutomationConditionOp): boolean {
  return OPS.find((o) => o.value === op)?.needsValue ?? true
}

export interface EditableRule {
  id: string
  name: string
  triggerEvent: string
  actionType: AutomationActionType
  subject: string
  body: string
  pushTitle: string
  pushBody: string
  pushUrl: string
  conditions: AutomationCondition[]
}

const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none'

export function RuleForm({
  triggers,
  rule,
  onDone,
}: {
  triggers: readonly string[]
  /** When set, the form edits this rule instead of creating a new one. */
  rule?: EditableRule
  /** Called after a successful edit (e.g. to close an inline editor). */
  onDone?: () => void
}) {
  const editing = !!rule
  const [name, setName] = useState(rule?.name ?? '')
  const [triggerEvent, setTriggerEvent] = useState(rule?.triggerEvent ?? triggers[0] ?? '')
  const [actionType, setActionType] = useState<AutomationActionType>(rule?.actionType ?? 'email_actor')
  const [subject, setSubject] = useState(rule?.subject ?? '')
  const [body, setBody] = useState(rule?.body ?? '')
  const [pushTitle, setPushTitle] = useState(rule?.pushTitle ?? '')
  const [pushBody, setPushBody] = useState(rule?.pushBody ?? '')
  const [pushUrl, setPushUrl] = useState(rule?.pushUrl ?? '')
  const [conditions, setConditions] = useState<AutomationCondition[]>(rule?.conditions ?? [])
  const [result, setResult] = useState<RuleResult | null>(null)
  const [pending, start] = useTransition()

  const isPush = actionType === 'push_actor'

  function addCondition() {
    setConditions((cs) => [...cs, { field: '', op: 'eq', value: '' }])
  }
  function updateCondition(i: number, patch: Partial<AutomationCondition>) {
    setConditions((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }
  function removeCondition(i: number) {
    setConditions((cs) => cs.filter((_, idx) => idx !== i))
  }

  function submit() {
    if (!name.trim()) return
    setResult(null)
    // Drop blank condition rows before sending; the server re-validates too.
    const cleaned = conditions
      .filter((c) => c.field.trim())
      .map((c) => ({ field: c.field.trim(), op: c.op, value: opNeedsValue(c.op) ? c.value : undefined }))
    const payload = { name, triggerEvent, actionType, subject, body, pushTitle, pushBody, pushUrl, conditions: cleaned }
    start(async () => {
      const res = editing ? await editRule(rule!.id, payload) : await createRule(payload)
      setResult(res)
      if (res.ok) {
        if (editing) {
          onDone?.()
        } else {
          setName('')
          setSubject('')
          setBody('')
          setPushTitle('')
          setPushBody('')
          setPushUrl('')
          setConditions([])
        }
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-4 max-w-2xl space-y-3">
      <h2 className="text-sm font-semibold text-text">{editing ? 'Edit automation' : 'New automation'}</h2>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Rule name (e.g. Congratulate first practice)"
        className={inputClass}
      />

      <label className="block text-xs text-subtle">
        When this event happens:
        <select
          value={triggerEvent}
          onChange={(e) => setTriggerEvent(e.target.value)}
          className={`mt-1 ${inputClass}`}
        >
          {triggers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      {/* Condition layer: every predicate must hold for the action to fire. */}
      <fieldset className="rounded-lg border border-border p-3 space-y-2">
        <legend className="px-1 text-xs text-subtle">Only when (optional)</legend>
        {conditions.length === 0 && (
          <p className="text-xs text-subtle">No conditions. The action fires on every matching event.</p>
        )}
        {conditions.map((c, i) => {
          const needsValue = opNeedsValue(c.op)
          return (
            <div key={i} className="flex items-center gap-2">
              <input
                value={c.field}
                onChange={(e) => updateCondition(i, { field: e.target.value })}
                placeholder="context field (e.g. source)"
                className={`${inputClass} flex-1`}
              />
              <select
                value={c.op}
                onChange={(e) => updateCondition(i, { op: e.target.value as AutomationConditionOp })}
                className={`${inputClass} w-40`}
              >
                {OPS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {needsValue && (
                <input
                  value={c.value ?? ''}
                  onChange={(e) => updateCondition(i, { value: e.target.value })}
                  placeholder="value"
                  className={`${inputClass} w-40`}
                />
              )}
              <button
                type="button"
                onClick={() => removeCondition(i)}
                aria-label="Remove condition"
                className="rounded-lg p-1.5 text-subtle hover:bg-surface-elevated hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
        <button
          type="button"
          onClick={addCondition}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-strong"
        >
          <Plus className="h-3.5 w-3.5" /> Add condition
        </button>
      </fieldset>

      <label className="block text-xs text-subtle">
        Then reach the member by:
        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value as AutomationActionType)}
          className={`mt-1 ${inputClass}`}
        >
          {CHANNELS.map((ch) => (
            <option key={ch.value} value={ch.value}>{ch.label}</option>
          ))}
        </select>
      </label>

      {isPush ? (
        <>
          <input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} placeholder="Push title" className={inputClass} />
          <textarea value={pushBody} onChange={(e) => setPushBody(e.target.value)} placeholder="Push body" rows={3} className={`${inputClass} resize-y`} />
          <input value={pushUrl} onChange={(e) => setPushUrl(e.target.value)} placeholder="Link path (optional, e.g. /crew)" className={inputClass} />
        </>
      ) : (
        <>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" className={inputClass} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Email body" rows={4} className={`${inputClass} resize-y`} />
        </>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending || !name.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-sm font-semibold px-4 py-2 shadow-sm transition-colors disabled:opacity-60"
        >
          <Plus className="w-4 h-4" />
          {pending ? 'Saving…' : editing ? 'Save changes' : 'Create automation'}
        </button>
        {editing && onDone && (
          <button onClick={onDone} className="text-sm text-subtle hover:text-text">Cancel</button>
        )}
        {result?.ok && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success font-medium">
            <Check className="w-4 h-4" /> {editing ? 'Saved' : 'Created'}
          </span>
        )}
        {result && !result.ok && (
          <span className="inline-flex items-center gap-1.5 text-sm text-danger">
            <AlertCircle className="w-4 h-4" /> {result.error}
          </span>
        )}
      </div>
    </div>
  )
}
