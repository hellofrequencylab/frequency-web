'use client'

import { useState, useTransition } from 'react'
import { Mail, Check } from 'lucide-react'
import { inviteByEmail } from '@/app/(main)/circles/actions'
import { Input } from '@/components/ui/field'

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
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Invite by email"
        aria-label="Invite by email"
        className="min-w-0 px-2.5 text-meta sm:w-auto sm:py-1.5"
      />
      <button
        onClick={submit}
        disabled={pending || !email}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-control border border-border px-3 py-2 text-meta font-medium text-muted hover:border-primary hover:text-primary-strong disabled:opacity-50 transition-colors sm:w-auto sm:py-1.5"
      >
        {sent ? <Check className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
        {pending ? 'Sending…' : sent ? 'Sent' : 'Send invite'}
      </button>
      {error && <span className="text-meta text-danger">{error}</span>}
    </div>
  )
}
