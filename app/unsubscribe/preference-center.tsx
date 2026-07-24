'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import type { NotificationTopic } from '@/lib/notification-preferences'
import { setContactTopicPreference, processSpaceUnsubscribe } from './actions'
import { isError } from '@/lib/action-result'

// The contact-facing preference center (Phase 6). Reached from a per-Space unsubscribe
// token: a non-member can opt DOWN a single topic instead of only hard-unsubscribing.
// The token in the URL is the authorisation (no login) and every action re-verifies it.

const TOPIC_LABELS: Partial<Record<NotificationTopic, { label: string; help: string }>> = {
  dispatches: { label: 'Dispatches', help: 'General updates and posts from this space.' },
  events:     { label: 'Event updates', help: 'RSVP changes and reminders before an event.' },
  marketing:  { label: 'Offers & news', help: 'Occasional promotions and announcements.' },
}

export type ContactTopicState = { topic: NotificationTopic; subscribed: boolean }

export function PreferenceCenter({
  spaceId,
  email,
  token,
  spaceName,
  initial,
}: {
  spaceId: string
  email: string
  token: string
  spaceName: string
  initial: ContactTopicState[]
}) {
  const [topics, setTopics] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unsubscribedAll, setUnsubscribedAll] = useState(false)

  function toggleTopic(topic: NotificationTopic) {
    const current = topics.find((t) => t.topic === topic)
    if (!current) return
    const nextSubscribed = !current.subscribed
    const prev = topics
    setTopics(topics.map((t) => (t.topic === topic ? { ...t, subscribed: nextSubscribed } : t)))
    setError(null)
    startTransition(async () => {
      const res = await setContactTopicPreference({ spaceId, email, token, topic, subscribed: nextSubscribed })
      if (isError(res)) {
        setTopics(prev)
        setError(res.error || 'Could not save. Try again.')
      } else {
        setSavedAt(Date.now())
      }
    })
  }

  function unsubscribeAll() {
    setError(null)
    startTransition(async () => {
      const res = await processSpaceUnsubscribe({ spaceId, email, token })
      if (isError(res)) {
        setError(res.error || 'Could not save. Try again.')
      } else {
        setUnsubscribedAll(true)
      }
    })
  }

  if (unsubscribedAll) {
    return (
      <p className="text-sm text-muted leading-relaxed">
        You&apos;re unsubscribed from all email from {spaceName}. This only stops this one sender,
        not Frequency itself. Changed your mind? Reply to one of their emails and they can add you
        back.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted leading-relaxed">
        Pick what you&apos;d like to keep hearing from {spaceName}. Turn off a topic and you&apos;ll
        stop getting that kind of email, while keeping the rest.
      </p>

      <div className="rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
        {topics.map(({ topic, subscribed }) => {
          const meta = TOPIC_LABELS[topic]
          if (!meta) return null
          return (
            <div key={topic} className="flex items-start gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">{meta.label}</p>
                <p className="mt-0.5 text-xs text-muted">{meta.help}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleTopic(topic)}
                role="switch"
                aria-checked={subscribed}
                aria-label={meta.label}
                className={`relative inline-flex items-center justify-center w-10 h-6 rounded-full transition-colors shrink-0 ${subscribed ? 'bg-primary' : 'bg-border hover:bg-border-strong'}`}
              >
                <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${subscribed ? 'translate-x-2' : '-translate-x-2'}`} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">
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
        </span>
        <button
          type="button"
          onClick={unsubscribeAll}
          className="text-xs font-semibold text-muted underline underline-offset-2 hover:text-text transition-colors"
        >
          Unsubscribe from everything
        </button>
      </div>
    </div>
  )
}
