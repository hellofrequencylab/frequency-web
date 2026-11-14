'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { PRACTICE_SUPPORT_CHOICES, practiceInvitationFor, type PracticeInvitationChoice } from '@/lib/practices/invitations'

/** A voluntary next door. Choice and dismissal live only in this mounted component. */
export function PracticeInvitation() {
  const headingId = useId()
  const [choice, setChoice] = useState<PracticeInvitationChoice | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const invitation = practiceInvitationFor(choice)

  if (dismissed) return null

  return (
    <section aria-labelledby={headingId} className="mb-6 rounded-card border border-border bg-surface p-4">
      <SectionHeader
        id={headingId}
        title="What would support you today?"
        action={<Button variant="ghost" size="sm" onClick={() => setDismissed(true)} aria-label="Dismiss practice invitation">Not now</Button>}
      />
      <p className="text-body-sm text-muted">Start with what feels useful. These areas can overlap, and your mix can change.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Choose a kind of support">
        {PRACTICE_SUPPORT_CHOICES.map((option) => (
          <Button
            key={option.id}
            variant={choice === option.id ? 'primarySoft' : 'secondary'}
            className="h-auto min-h-11 whitespace-normal text-left"
            aria-pressed={choice === option.id}
            onClick={() => setChoice(option.id)}
          >
            <span className="min-w-0 flex-1">
              <span className="block">{option.label}</span>
              <span className="block text-meta text-muted">{option.area}</span>
            </span>
          </Button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => setChoice('familiar')} aria-pressed={choice === 'familiar'}>Stay with something familiar</Button>
        <Button variant="ghost" size="sm" onClick={() => setChoice('rest')} aria-pressed={choice === 'rest'}>Rest today</Button>
      </div>
      {invitation && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-body-sm text-muted" role="status">{invitation.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {invitation.kind === 'explore' && <Button asChild size="sm"><Link href={invitation.href} prefetch={false}>{invitation.action}</Link></Button>}
            <Button variant="ghost" size="sm" onClick={() => setChoice(null)}>Something else</Button>
          </div>
        </div>
      )}
    </section>
  )
}
