'use client'

import { useState, useTransition } from 'react'
import { Plus, Check, AlertCircle } from 'lucide-react'
import type { AutomationActionType } from '@/lib/automations'
import { createRule, type RuleResult } from './actions'

const CHANNELS: { value: AutomationActionType; label: string }[] = [
  { value: 'email_actor', label: 'Email' },
  { value: 'push_actor', label: 'Push' },
]

export function RuleForm({ triggers }: { triggers: readonly string[] }) {
  const [name, setName] = useState('')
  const [triggerEvent, setTriggerEvent] = useState(triggers[0] ?? '')
  const [actionType, setActionType] = useState<AutomationActionType>('email_actor')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [pushTitle, setPushTitle] = useState('')
  const [pushBody, setPushBody] = useState('')
  const [pushUrl, setPushUrl] = useState('')
  const [result, setResult] = useState<RuleResult | null>(null)
  const [pending, start] = useTransition()

  const isPush = actionType === 'push_actor'

  function submit() {
    if (!name.trim()) return
    setResult(null)
    start(async () => {
      const res = await createRule({
        name,
        triggerEvent,
        actionType,
        subject,
        body,
        pushTitle,
        pushBody,
        pushUrl,
      })
      setResult(res)
      if (res.ok) {
        setName('')
        setSubject('')
        setBody('')
        setPushTitle('')
        setPushBody('')
        setPushUrl('')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-4 max-w-2xl space-y-3">
      <h2 className="text-sm font-semibold text-text">New automation</h2>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Rule name (e.g. Congratulate first practice)"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
      />

      <label className="block text-xs text-subtle">
        When this event happens:
        <select
          value={triggerEvent}
          onChange={(e) => setTriggerEvent(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none"
        >
          {triggers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-subtle">
        Then reach the member by:
        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value as AutomationActionType)}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none"
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>

      {isPush ? (
        <>
          <input
            value={pushTitle}
            onChange={(e) => setPushTitle(e.target.value)}
            placeholder="Push title"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
          />
          <textarea
            value={pushBody}
            onChange={(e) => setPushBody(e.target.value)}
            placeholder="Push body"
            rows={3}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none resize-y"
          />
          <input
            value={pushUrl}
            onChange={(e) => setPushUrl(e.target.value)}
            placeholder="Link path (optional, e.g. /crew)"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
          />
        </>
      ) : (
        <>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Email body"
            rows={4}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none resize-y"
          />
        </>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending || !name.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-sm font-semibold px-4 py-2 shadow-sm transition-colors disabled:opacity-60"
        >
          <Plus className="w-4 h-4" />
          {pending ? 'Creating…' : 'Create automation'}
        </button>
        {result?.ok && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success font-medium">
            <Check className="w-4 h-4" /> Created
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
