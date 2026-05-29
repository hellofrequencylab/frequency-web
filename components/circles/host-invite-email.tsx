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
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Invite by email"
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text placeholder:text-subtle focus:border-primary focus:outline-none"
      />
      <button
        onClick={submit}
        disabled={pending || !email}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-primary hover:text-primary-strong disabled:opacity-50 transition-colors"
      >
        {sent ? <Check className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
        {pending ? 'Sending…' : sent ? 'Sent' : 'Send invite'}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}
