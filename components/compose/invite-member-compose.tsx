'use client'

import { useState } from 'react'
import { UserPlus, Check, Copy } from 'lucide-react'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

export function InviteMemberCompose({
  inviterName,
  buttonLabel = 'Invite Member',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap',
}: {
  inviterName: string
  buttonLabel?: string
  buttonClass?: string
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState(
    `Hi! ${inviterName} here. I'm using Frequency to connect with my local community and thought you'd love it too. Sign up here:`
  )
  const [copied, setCopied] = useState(false)

  const signupUrl = 'https://go.findafreq.com/sign-in'
  const mailtoBody = `${message}\n\n${signupUrl}\n\nSee you there!\n${inviterName}`
  const mailto = `mailto:${email}?subject=${encodeURIComponent('Join me on Frequency')}&body=${encodeURIComponent(mailtoBody)}`

  function handleCopy() {
    navigator.clipboard.writeText(`${message}\n\n${signupUrl}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    window.location.href = mailto
    setOpen(false)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass}>
        <UserPlus className="w-4 h-4" />
        {buttonLabel}
      </button>

      <CreateModal
        open={open} onClose={() => setOpen(false)} onSubmit={handleSubmit}
        title="Invite a Member" titleIcon={UserPlus} titleIconColor="indigo"
        submitLabel="Open Email" pendingLabel="Opening…"
        submitDisabled={!email.trim() || !message.trim()}
      >
        <div>
          <label className={cmLabel}>Their email *</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="friend@example.com" required className={cmInput} />
        </div>

        <div>
          <label className={cmLabel}>Your message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)}
            rows={4} className={`${cmInput} resize-y leading-relaxed`} />
          <p className="text-[11px] text-subtle mt-1">
            The signup link will be added automatically at the bottom.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-elevated p-3">
          <div className="flex items-center justify-between gap-2">
            <code className="text-[11px] text-muted truncate">{signupUrl}</code>
            <button type="button" onClick={handleCopy}
              className="shrink-0 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-primary-strong hover:bg-primary-bg dark:hover:bg-primary-bg transition-colors">
              {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy link</>}
            </button>
          </div>
        </div>
      </CreateModal>
    </>
  )
}
