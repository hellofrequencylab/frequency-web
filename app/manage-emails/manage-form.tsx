'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import type { NotificationCategory } from '@/lib/notification-preferences'
import { setEmailCategoryPreference } from './actions'
import { isError } from '@/lib/action-result'

// The member-facing "Manage emails" preference center. Reached from the footer "Manage emails" link with a
// (profileId, category) token — no login. Each toggle re-verifies the token server-side. A member can turn an
// email type off (unsubscribe from just that type) or back on (resubscribe), one row at a time. Voice canon:
// plain, no em dashes.

const CATEGORY_LABELS: { key: NotificationCategory; label: string; help: string }[] = [
  { key: 'dispatches', label: 'Dispatches', help: 'Dispatch posts from your Hosts and the wider community.' },
  { key: 'events', label: 'Events', help: 'RSVP changes and reminders before an event starts.' },
  { key: 'comments', label: 'Replies', help: 'Replies and mentions on posts and comments you wrote.' },
  { key: 'mentions', label: 'Mentions', help: 'When someone @mentions you anywhere else.' },
  { key: 'lifecycle', label: 'Onboarding nudges', help: 'Day 1, Day 3, and Day 7 check-ins after you join a circle.' },
]

export type EmailCategoryState = { category: NotificationCategory; subscribed: boolean }

export function ManageEmailsForm({
  profileId,
  tokenCategory,
  token,
  initial,
}: {
  profileId: string
  tokenCategory: string
  token: string
  initial: EmailCategoryState[]
}) {
  const [states, setStates] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  function toggle(category: NotificationCategory) {
    const current = states.find((s) => s.category === category)
    if (!current) return
    const nextSubscribed = !current.subscribed
    const prev = states
    setStates(states.map((s) => (s.category === category ? { ...s, subscribed: nextSubscribed } : s)))
    setError(null)
    startTransition(async () => {
      const res = await setEmailCategoryPreference({
        profileId,
        tokenCategory,
        token,
        category,
        subscribed: nextSubscribed,
      })
      if (isError(res)) {
        setStates(prev)
        setError(res.error || 'Could not save. Try again.')
      } else {
        setSavedAt(Date.now())
      }
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted leading-relaxed">
        Pick which emails you want from Frequency. Turn one off to stop that kind of email, or back on to
        start again. Changes save right away.
      </p>

      <div className="rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
        {states.map(({ category, subscribed }) => {
          const meta = CATEGORY_LABELS.find((c) => c.key === category)
          if (!meta) return null
          return (
            <div key={category} className="flex items-start gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">{meta.label}</p>
                <p className="mt-0.5 text-xs text-muted">{meta.help}</p>
              </div>
              <button
                type="button"
                onClick={() => toggle(category)}
                role="switch"
                aria-checked={subscribed}
                aria-label={meta.label}
                className={`relative inline-flex items-center justify-center w-10 h-6 rounded-full transition-colors shrink-0 ${subscribed ? 'bg-primary' : 'bg-border hover:bg-border-strong'}`}
              >
                <span
                  className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${subscribed ? 'translate-x-2' : '-translate-x-2'}`}
                />
              </button>
            </div>
          )
        })}
      </div>

      <div className="text-xs text-muted px-1">
        {isPending ? (
          'Saving…'
        ) : error ? (
          <span className="text-danger">{error}</span>
        ) : savedAt ? (
          <span className="flex items-center gap-1.5 text-success">
            <Check className="w-3 h-3" /> Saved
          </span>
        ) : (
          'Changes save instantly.'
        )}
      </div>
    </div>
  )
}
