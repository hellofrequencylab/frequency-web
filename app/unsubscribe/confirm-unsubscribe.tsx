'use client'

import { useState, useTransition } from 'react'
import { processUnsubscribe } from './actions'
import { isError } from '@/lib/action-result'
import { Layout, Body, ManageLink } from './card'

// The member unsubscribe confirm step (L2-01). The page used to opt the member out DURING RENDER,
// so any HTTP GET of the link did it: corporate link scanners and mail-client prefetchers fetch
// every URL in an email, and members were silently unsubscribed without ever clicking. Now a GET
// only shows this button; `processUnsubscribe` runs from the server action the click invokes,
// which is a POST by construction. The token in the URL is still the whole authorisation (no
// login) and the action re-verifies it before writing. RFC 8058 one-click is unaffected: mailbox
// providers POST to /api/unsubscribe, never to this page.

export function ConfirmUnsubscribe({
  profileId,
  category,
  token,
  label,
}: {
  profileId: string
  category: string
  token: string
  /** Human label for the category, e.g. "event reminders". */
  label: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function confirm() {
    setError(null)
    startTransition(async () => {
      const res = await processUnsubscribe({ profileId, category, token })
      if (isError(res)) {
        setError(res.error || 'Could not save your preference. Please try again.')
      } else {
        setDone(true)
      }
    })
  }

  if (done) {
    return (
      <Layout title="You're unsubscribed." description={`You'll no longer receive ${label} from Frequency by email.`}>
        <Body>You can re-enable this any time, and adjust other notification types, from your settings.</Body>
        <ManageLink />
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout title="Couldn't process unsubscribe" description={error}>
        <ManageLink />
      </Layout>
    )
  }

  return (
    <Layout
      title={`Unsubscribe from ${label}?`}
      description={`You'll stop getting ${label} from Frequency by email. Everything else stays as it is.`}
    >
      <div className="pt-3">
        <button
          type="button"
          onClick={confirm}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-control bg-primary text-on-primary text-body-sm font-semibold px-4 py-2 hover:bg-primary-hover transition-colors disabled:opacity-60"
        >
          {isPending ? 'Unsubscribing…' : 'Unsubscribe'}
        </button>
      </div>
      <Body>Changed your mind? Just close this page. Nothing changes until you click.</Body>
    </Layout>
  )
}
