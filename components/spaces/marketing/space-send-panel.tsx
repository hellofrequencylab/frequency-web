'use client'

// SPACE SEND PANEL — the right rail of the space "New email" popup: pick who gets it, see the live count,
// and send now. The space-scoped twin of the admin email-studio SendPanel, wired to the SAME anti-spam send
// seam every Space campaign uses (sendSpaceEmailDraft -> lib/spaces/email), so the kill-switch, per-Space
// daily cap, suppression, per-recipient unsubscribe, and the outreach_sends ledger all still apply. The
// audience picker + its live count come from the shared AudiencePicker (countSpaceAudience resolves the same
// way the send does, so the number the owner confirms is the number who get the email).
//
// Payments-style safety: a real send resolves the live audience, then takes TWO explicit confirms before it
// goes out. There is no undo. Voice canon: no em dashes.

import { useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/admin/status'
import { AudiencePicker } from '@/components/spaces/email/audience-picker'
import { sendSpaceEmailDraft } from '@/lib/spaces/email-drafts'
import type { AudienceFilter } from '@/lib/spaces/audiences'
import { isError } from '@/lib/action-result'

export function SpaceSendPanel({
  spaceId,
  slug,
  campaignId,
  status,
  tags,
  segments,
  readOnly = false,
  onSent,
}: {
  spaceId: string
  slug: string
  campaignId: string
  /** The draft's current status. A `sent` draft locks the panel. */
  status: string
  tags: string[]
  segments: { id: string; name: string }[]
  /** A staff janitor preview: the send control is hidden. */
  readOnly?: boolean
  /** Called after a successful send so the parent list can flip the row to "sent". */
  onSent?: () => void
}) {
  const [filter, setFilter] = useState<AudienceFilter>({ tag: null })
  const [count, setCount] = useState<number | null>(null)
  const [sent, setSent] = useState(status === 'sent')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function sendNow() {
    setError(null)
    setNote(null)
    if (count === 0) {
      setError('This audience is empty. Pick a segment with recipients before sending.')
      return
    }
    const size = count ?? 0
    // Two-step confirm: the count first, then an explicit final go. A mass send cannot be undone.
    if (!window.confirm(`Send this email now to ${size.toLocaleString()} ${size === 1 ? 'person' : 'people'}? This cannot be undone.`)) return
    if (!window.confirm(`Really send to ${size.toLocaleString()} ${size === 1 ? 'person' : 'people'} right now? There is no undo once it goes out.`)) return
    start(async () => {
      const res = await sendSpaceEmailDraft(spaceId, campaignId, filter)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setSent(true)
      setNote(`Sent to ${res.data.recipientCount.toLocaleString()} ${res.data.recipientCount === 1 ? 'person' : 'people'}.`)
      onSent?.()
    })
  }

  if (sent) {
    return (
      <div className="space-y-3">
        <Banner tone="info" title="This email has been sent." />
        {note && <Banner tone="info" title={note} />}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <AudiencePicker
        spaceId={spaceId}
        slug={slug}
        tags={tags}
        segments={segments}
        filter={filter}
        onFilterChange={setFilter}
        onCountChange={setCount}
        disabled={readOnly || pending}
      />

      {!readOnly && (
        <Button className="w-full" disabled={pending || count === 0} onClick={sendNow}>
          <Send className="h-4 w-4" aria-hidden /> Send now
        </Button>
      )}

      {error && (
        <Banner tone="critical" title="That did not go through">
          {error}
        </Banner>
      )}
      {note && <Banner tone="info" title={note} />}
    </div>
  )
}
