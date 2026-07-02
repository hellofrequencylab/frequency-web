'use client'

import { useState, useTransition } from 'react'
import { Send, Check, AlertCircle, Users } from 'lucide-react'
import { sendCampaign, previewBroadcast, type SendCampaignResult } from './actions'

export function CampaignComposer({ options }: { options: { key: string; label: string }[] }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [segment, setSegment] = useState<string>(options[0]?.key ?? 'members')
  const [audience, setAudience] = useState<number | null>(null)
  const [result, setResult] = useState<SendCampaignResult | null>(null)
  const [pending, start] = useTransition()
  const [previewing, startPreview] = useTransition()

  function onSegmentChange(value: string) {
    setSegment(value)
    setAudience(null)
    setResult(null)
  }

  function preview() {
    setAudience(null)
    startPreview(async () => {
      const res = await previewBroadcast(segment)
      if (res.ok) setAudience(res.audienceSize ?? 0)
    })
  }

  function submit() {
    if (!subject.trim() || !body.trim()) return
    setResult(null)
    // A broadcast is irreversible and mass-scale — resolve the audience first so the
    // operator confirms the real recipient count before it fires.
    startPreview(async () => {
      const preview = await previewBroadcast(segment)
      if (!preview.ok) {
        setResult({ ok: false, error: preview.error ?? 'Could not resolve the audience.' })
        return
      }
      const size = preview.audienceSize ?? 0
      setAudience(size)
      const label = options.find((o) => o.key === segment)?.label ?? segment
      const confirmed = window.confirm(
        `Send this broadcast to ${size.toLocaleString()} contact${size === 1 ? '' : 's'} in "${label}"?\n\n` +
          'The queued count can be lower once each recipient passes the consent and suppression gate.',
      )
      if (!confirmed) return
      start(async () => {
        const res = await sendCampaign({ subject, body, segment })
        setResult(res)
        if (res.ok) {
          setSubject('')
          setBody('')
          setAudience(null)
        }
      })
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-4 max-w-2xl space-y-3">
      <h2 className="text-sm font-semibold text-text">New broadcast</h2>

      <div className="flex items-center gap-2">
        <select
          value={segment}
          onChange={(e) => onSegmentChange(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none"
        >
          {options.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={preview}
          disabled={previewing}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text hover:bg-surface-elevated transition-colors disabled:opacity-60"
        >
          <Users className="h-4 w-4" />
          {previewing ? 'Counting…' : 'Preview audience'}
        </button>
      </div>

      {audience !== null && (
        <p className="text-xs text-muted">
          {audience.toLocaleString()} contact{audience === 1 ? '' : 's'} in this segment. The queued count can be
          lower once each recipient passes the consent and suppression gate.
        </p>
      )}

      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your message. Blank lines become paragraphs."
        rows={8}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none resize-y"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending || previewing || !subject.trim() || !body.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-sm font-semibold px-4 py-2 shadow-sm transition-colors disabled:opacity-60"
        >
          <Send className="w-4 h-4" />
          {pending ? 'Sending…' : 'Send broadcast'}
        </button>

        {result?.ok && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success font-medium">
            <Check className="w-4 h-4" /> Queued to {result.recipientCount} member(s)
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
