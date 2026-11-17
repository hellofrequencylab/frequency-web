'use client'

import { useCallback, useState, useTransition } from 'react'
import { Check, HandHeart, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { isError } from '@/lib/action-result'
import { MemberComposer } from '@/components/admin/crm/member-composer'
import {
  markWelcomedAction,
  sendWelcomeAction,
  startWelcomeDraftAction,
} from '@/components/admin/crm/welcome-actions'
import type { MemberSummary } from './types'

// THE PERSONAL WELCOME GLOW (LIVE-2340). On the Resonance CRM roster, a member who has not had their personal
// welcome carries a glowing "Say hi" mark (the style system's primary glow + the freq-glow breath, still under
// reduced motion). Pressing it opens the member composer on a pre-filled, editable welcome addressed to that one
// member. The send is a person pressing Send through the ordinary gated 1:1 send; it records the welcome so the glow
// clears. Nothing is ever sent automatically. Semantic tokens only; admin chrome, never Space-themed. No em dashes.

/** The glowing pill on a roster row or card. It sits INSIDE the row's option (a listbox may only hold options),
 *  so it is a mark, not a second control: a pointer press opens the welcome without selecting the row, and its
 *  "Say hi" text joins the option's name. Keyboard and screen reader users reach the same pop-up through the
 *  WelcomeBanner button atop the member's pane. */
export function WelcomeGlowMark({
  member,
  onOpen,
  className,
}: {
  member: MemberSummary
  onOpen: (member: MemberSummary) => void
  className?: string
}) {
  return (
    <span
      data-welcome-glow
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onOpen(member)
      }}
      title="Not welcomed yet. Send a personal welcome."
      className={cn(
        'animate-glow inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-pill border border-primary/40 bg-primary-bg px-2.5 py-1 text-2xs font-semibold text-primary-strong shadow-glow-primary-sm transition-colors hover:border-primary',
        className,
      )}
    >
      <HandHeart className="h-3.5 w-3.5" aria-hidden />
      Say hi
    </span>
  )
}

/** The pane's welcome prompt: a real button, so the welcome is reachable from the keyboard. */
export function WelcomeBanner({
  member,
  onOpen,
}: {
  member: MemberSummary
  onOpen: (member: MemberSummary) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary/40 bg-primary-bg px-4 py-3 shadow-glow-primary-sm">
      <p className="min-w-0 flex-1 text-body-sm text-text">
        <span className="font-semibold">{member.displayName}</span> has not had a personal welcome yet.
      </p>
      <Button type="button" size="sm" onClick={() => onOpen(member)}>
        <HandHeart className="h-4 w-4" aria-hidden /> Send a welcome
      </Button>
    </div>
  )
}

/** The welcome pop-up: the member composer on a pre-filled welcome draft, pinned to this one member. */
export function WelcomeDialog({
  member,
  onClose,
  onWelcomed,
}: {
  member: MemberSummary | null
  onClose: () => void
  onWelcomed: (profileId: string) => void
}) {
  const profileId = member?.id ?? ''
  const [marking, startMarking] = useTransition()
  const [markError, setMarkError] = useState<string | null>(null)

  const startDraft = useCallback(() => startWelcomeDraftAction(profileId), [profileId])
  const send = useCallback(
    async (campaignId: string) => {
      const res = await sendWelcomeAction(campaignId, profileId)
      if (!isError(res) && res.data.recipientCount > 0) onWelcomed(profileId)
      return res
    },
    [profileId, onWelcomed],
  )

  const markDone = () =>
    startMarking(async () => {
      setMarkError(null)
      const res = await markWelcomedAction(profileId)
      if (isError(res)) {
        setMarkError(res.error)
        return
      }
      onWelcomed(profileId)
      onClose()
    })

  return (
    <Dialog
      open={!!member}
      onClose={onClose}
      ariaLabel={member ? `Welcome ${member.displayName}` : 'Personal welcome'}
      className="max-w-4xl !mt-0"
    >
      {member && (
        <div className="flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-card border border-border bg-surface lift-3">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div className="min-w-0">
              <h3 className="truncate text-body-sm font-bold text-text">Welcome {member.displayName}</h3>
              <p className="truncate text-2xs text-muted">
                A personal hello from you. Make it yours, then send. It saves as you type.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={markDone} disabled={marking}>
                <Check className="h-3.5 w-3.5" aria-hidden /> Already said hi
              </Button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-control p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          {markError && (
            <p role="alert" className="border-b border-border px-5 py-2 text-meta text-danger">
              {markError}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <MemberComposer
              key={member.id}
              profileId={member.id}
              email=""
              displayName={member.displayName}
              title="Personal welcome"
              lockAudience
              startDraft={startDraft}
              sendAction={send}
            />
          </div>
        </div>
      )}
    </Dialog>
  )
}
