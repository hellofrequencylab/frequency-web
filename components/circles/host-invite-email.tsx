'use client'

import { useState, useTransition } from 'react'
import { Mail, Check } from 'lucide-react'
import { inviteByEmail } from '@/app/(main)/circles/actions'

// Invite by email from Host Tools. Sends through the durable email queue.
export function HostInviteEmail({ circleId }: { circleId: string }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    if (!email) return
    setError(null)
    start(async () => {
      const res = await inviteByEmail(circleId, email)
      if (res.ok) {
        setSent(true)
        setEmail('')
        setTimeout(() => setSent(false), 3000)
      } else {
        setError(res.error ?? 'Could not send invite.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Invite by email"
        className="w-full min-w-0 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs text-text placeholder:text-subtle focus:border-border-strong focus:outline-none sm:w-auto sm:py-1.5"
      />
      <button
        onClick={submit}
        disabled={pending || !email}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted hover:border-primary hover:text-primary-strong disabled:opacity-50 transition-colors sm:w-auto sm:py-1.5"
      >
        {sent ? <Check className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
        {pending ? 'Sending…' : sent ? 'Sent' : 'Send invite'}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}
