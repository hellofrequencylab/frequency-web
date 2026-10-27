'use client'

import { useState, useTransition } from 'react'
import { Link2, Check, Loader2 } from 'lucide-react'
import { createInviteLink } from '../actions'
import { buttonClasses } from '@/components/ui/button'

export function InviteLinkButton({ circleId }: { circleId: string }) {
  const [copied, setCopied]     = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const { token } = await createInviteLink(circleId)
      const url = `${window.location.origin}/join/${token}`
      try {
        await navigator.clipboard.writeText(url)
      } catch {
        // Fallback for browsers that block clipboard access
        const el = document.createElement('textarea')
        el.value = url
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={buttonClasses('ghost', 'xs')}
      aria-label={copied ? 'Link copied!' : 'Copy invite link'}
      title={copied ? 'Link copied!' : 'Copy invite link'}
    >
      {isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : copied ? (
        <Check className="w-3.5 h-3.5 text-success" />
      ) : (
        <Link2 className="w-3.5 h-3.5" />
      )}
    </button>
  )
}
