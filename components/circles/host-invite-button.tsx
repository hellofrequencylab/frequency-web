'use client'

import { useState, useTransition } from 'react'
import { Link2, Check, Loader2 } from 'lucide-react'
import { createHostInviteLink } from '@/app/(main)/circles/actions'
import { isError } from '@/lib/action-result'

// Generate + copy a circle invite link. Every failure is RENDERED: a refusal from the
// server gate used to land in console.error, so a manager the old host-only gate turned
// away saw a button that did nothing at all.
export function HostInviteButton({ circleId }: { circleId: string }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await createHostInviteLink(circleId)
        if (isError(res)) {
          setError(res.error)
          return
        }
        const url = `${window.location.origin}/join/${res.data.token}`
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
        setError('Could not create an invite link. Try again in a moment.')
      }
    })
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-meta font-medium text-muted hover:border-primary hover:text-primary-strong hover:bg-primary-bg dark:hover:bg-primary-bg disabled:opacity-50 transition-colors"
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
      {error && (
        <span role="alert" className="text-meta text-danger">
          {error}
        </span>
      )}
    </span>
  )
}
