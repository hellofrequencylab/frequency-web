'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ShieldCheck, X } from 'lucide-react'
import { acknowledgeMeetupSafetyAction } from '@/app/(main)/feed/people-actions'

// The meet-safely note (Resonance Feed Phase 4, ADR-418). The owner's safety idea in one
// calm line: people meet at a real circle or public event, and we make staying safe easy.
// Shows once until acknowledged ("Got it" writes meetup_safety_ack_at), then stays quiet.
// Dismissing is optimistic; the link goes to the full safety guide.
export function MeetupSafetyNote({ acknowledged }: { acknowledged: boolean }) {
  const [dismissed, setDismissed] = useState(acknowledged)
  const [, startTransition] = useTransition()
  if (dismissed) return null

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      <p className="min-w-0 text-xs text-muted">
        Meeting someone new? The easiest way is at a circle or a public event, where you&rsquo;re never
        on your own.{' '}
        <Link href="/help/safety/meeting-people-safely" className="font-semibold text-primary-strong hover:underline">
          How to meet safely
        </Link>
      </p>
      <button
        type="button"
        aria-label="Got it"
        onClick={() => {
          setDismissed(true)
          startTransition(async () => {
            await acknowledgeMeetupSafetyAction()
          })
        }}
        className="shrink-0 rounded-full p-1 text-subtle transition-colors hover:bg-surface hover:text-text"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
