'use client'

import { useState, useTransition } from 'react'
import { Send, Users, Loader2, Check } from 'lucide-react'
import { sendOutreach } from './actions'
import { isError } from '@/lib/action-result'

export function OutreachForm({ scope }: { scope: string }) {
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  function submit() {
    setResult(null)
    startTransition(async () => {
      const r = await sendOutreach(message)
      if (isError(r)) {
        setResult({ ok: false, text: r.error })
      } else {
        const n = r.data.sent
        setResult({ ok: true, text: n === 0 ? 'No active members to reach yet.' : `Sent to ${n} ${n === 1 ? 'member' : 'members'}.` })
        setMessage('')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
        <Users className="h-4 w-4 text-primary-strong" />
        Message your {scope}
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder={`Write a note to everyone in your ${scope}…`}
        className="w-full resize-none rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm text-text placeholder:text-subtle outline-none focus:border-primary"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-subtle">Sends through the same email + push spine as Broadcast.</p>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !message.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
        </button>
      </div>
      {result && (
        <p className={`mt-3 inline-flex items-center gap-1.5 text-sm ${result.ok ? 'text-success' : 'text-danger'}`}>
          {result.ok && <Check className="h-4 w-4 shrink-0" />} {result.text}
        </p>
      )}
    </div>
  )
}
