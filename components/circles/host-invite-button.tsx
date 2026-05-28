'use client'

import { useState, useTransition } from 'react'
import { Link2, Check, Loader2 } from 'lucide-react'
import { createHostInviteLink } from '@/app/(main)/circles/actions'

export function HostInviteButton({ circleId }: { circleId: string }) {
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      try {
        const { token } = await createHostInviteLink(circleId)
        const url = `${window.location.origin}/join/${token}`
        try {
          await navigator.clipboard.writeText(url)
        } catch {
          const el = document.createElement('textarea')
          el.value = url
          document.body.appendChild(el)
          el.select()
          document.execCommand('copy')
          document.body.removeChild(el)
        }
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      } catch (err) {
        console.error('[HostInviteButton]', err)
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-primary hover:text-primary-strong hover:bg-primary-bg dark:hover:bg-primary-bg disabled:opacity-50 transition-colors"
      title={copied ? 'Link copied!' : 'Generate invite link'}
    >
      {isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : copied ? (
        <Check className="w-3.5 h-3.5 text-success" />
      ) : (
        <Link2 className="w-3.5 h-3.5" />
      )}
      {copied ? 'Copied!' : 'Invite link'}
    </button>
  )
}
