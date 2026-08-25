'use client'

import { useState, useTransition } from 'react'
import { Trash2, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { IconButton } from '@/components/ui/icon-button'
import {
  signSpotlightGuestbook,
  removeGuestbookEntry,
  hideGuestbookEntry,
} from '@/app/spotlight/[handle]/guestbook-actions'
import { GUESTBOOK_MESSAGE_MAX } from '@/lib/spotlight/guestbook.shared'

// The Guestbook's two client islands (ADR-1132). Everything they submit goes through the
// session-scoped server actions in app/spotlight/[handle]/guestbook-actions.ts, where RLS
// is the authorization boundary; these components only hold form state. After a successful
// action the server revalidates both rendering routes, so the RSC entry list refreshes
// without any client-side copy of the data. Controls compose the kit primitives (Textarea /
// Button / IconButton) per PAGE-FRAMEWORK and the adoption ratchets.

/** The sign form, shown to a signed-in member who has not signed this guestbook yet. */
export function GuestbookSignForm({
  ownerHandle,
  ownerName,
}: {
  ownerHandle: string
  ownerName: string
}) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await signSpotlightGuestbook(ownerHandle, message)
      if (result.error) {
        setError(result.error)
        return
      }
      setMessage('')
    })
  }

  return (
    <form
      className="mt-4 space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <label htmlFor="guestbook-note" className="sr-only">
        Leave a note
      </label>
      <Textarea
        id="guestbook-note"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={GUESTBOOK_MESSAGE_MAX}
        rows={3}
        placeholder={`Leave a note for ${ownerName}`}
        aria-invalid={error ? true : undefined}
      />
      {error && <p className="text-body-sm text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <span className="text-meta text-subtle">
          {message.length}/{GUESTBOOK_MESSAGE_MAX}
        </span>
        <Button type="submit" loading={pending} disabled={message.trim().length === 0}>
          Sign the guestbook
        </Button>
      </div>
    </form>
  )
}

/**
 * Per-entry controls. The OWNER sees hide + remove (moderation); a SIGNER sees remove on
 * their own note only. RLS enforces both server-side; unauthorized calls change nothing.
 */
export function GuestbookEntryControls({
  entryId,
  ownerHandle,
  canModerate,
}: {
  entryId: string
  ownerHandle: string
  canModerate: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (action: () => Promise<{ error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
    })
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      {error && <span className="text-meta text-danger">{error}</span>}
      {canModerate && (
        <IconButton
          label="Hide this note"
          loading={pending}
          onClick={() => run(() => hideGuestbookEntry(entryId, ownerHandle))}
        >
          <EyeOff className="h-4 w-4" aria-hidden />
        </IconButton>
      )}
      <IconButton
        label="Remove this note"
        tone="danger"
        loading={pending}
        onClick={() => run(() => removeGuestbookEntry(entryId, ownerHandle))}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </IconButton>
    </span>
  )
}
