'use client'

import { useState, useTransition } from 'react'
import { Send, Check, AlertCircle } from 'lucide-react'
import { sendCampaign, type SendCampaignResult } from './actions'

export function CampaignComposer({ options }: { options: { key: string; label: string }[] }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [segment, setSegment] = useState<string>(options[0]?.key ?? 'members')
  const [result, setResult] = useState<SendCampaignResult | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    if (!subject.trim() || !body.trim()) return
    setResult(null)
    start(async () => {
      const res = await sendCampaign({ subject, body, segment })
      setResult(res)
      if (res.ok) {
        setSubject('')
        setBody('')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-4 max-w-2xl space-y-3">
      <h2 className="text-sm font-semibold text-text">New campaign</h2>

      <select
        value={segment}
        onChange={(e) => setSegment(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
      >
        {options.map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>

      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your message. Blank lines become paragraphs."
        rows={8}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none resize-y"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending || !subject.trim() || !body.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-sm font-semibold px-4 py-2 shadow-sm transition-colors disabled:opacity-60"
        >
          <Send className="w-4 h-4" />
          {pending ? 'Sending…' : 'Send campaign'}
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
