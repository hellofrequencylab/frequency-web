'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, UserPlus, Loader2 } from 'lucide-react'
import { Button, buttonClasses } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { isError, type ActionResult } from '@/lib/action-result'
import {
  acceptCollaboration,
  declineCollaboration,
  revokeCollaboration,
  requestCollaborationBySlug,
} from '@/app/(main)/spaces/[slug]/collaborations-actions'

// The interactive controls for the Collaborators management surface (ADR-799 B1-UI). Small client
// wrappers over the 'use server' collaboration actions; the reads + layout stay in the server body.

/** Approve / decline buttons for an incoming request (the approver side). */
export function RequestControls({ collaborationId }: { collaborationId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: (id: string) => Promise<ActionResult>) =>
    start(async () => {
      setError(null)
      const res = await fn(collaborationId)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(acceptCollaboration)}
        className={buttonClasses('primary', 'sm')}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
        Approve
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(declineCollaboration)}
        className={buttonClasses('secondary', 'sm')}
      >
        <X className="h-4 w-4" aria-hidden />
        Decline
      </button>
      {error && <span className="text-xs font-medium text-danger">{error}</span>}
    </div>
  )
}

/** End / cancel a collaboration (either side). */
export function RevokeControl({ collaborationId, label = 'Remove' }: { collaborationId: string; label?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const res = await revokeCollaboration(collaborationId)
            if (isError(res)) setError(res.error)
            else router.refresh()
          })
        }
        className="text-xs font-medium text-muted underline decoration-dashed underline-offset-4 transition-colors hover:text-danger"
      >
        {pending ? 'Working' : label}
      </button>
      {error && <span className="text-xs font-medium text-danger">{error}</span>}
    </div>
  )
}

/** Invite a collaborator by their space link or slug. */
export function InviteCollaborator({ spaceId }: { spaceId: string }) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function submit() {
    if (!value.trim() || pending) return
    start(async () => {
      setError(null)
      setNotice(null)
      const res = await requestCollaborationBySlug(spaceId, value, 'initiator')
      if (isError(res)) {
        setError(res.error)
        return
      }
      setNotice('Invite sent. They approve it from their own Collaborators page.')
      setValue('')
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-sm font-semibold text-text">Invite a collaborator</p>
      <p className="mt-1 text-xs text-subtle">
        Paste the other business space&rsquo;s link or slug. They run inside your space but keep their own
        business. They approve the invite from their own Collaborators page.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="royal-temple  or  frequencylocal.com/spaces/royal-temple"
          className="min-w-0 flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <Button type="button" onClick={submit} disabled={!value.trim() || pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
          Send invite
        </Button>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
      {notice && !error && <p className="mt-2 text-sm font-medium text-success">{notice}</p>}
    </div>
  )
}
