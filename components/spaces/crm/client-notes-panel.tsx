'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { isError } from '@/lib/action-result'
import { addClientNote, deleteClientNote } from '@/lib/crm/client-notes-actions'
import type { ClientNote } from '@/lib/crm/client-notes'

// CLIENT NOTES PANEL (client, ENTITY-SPACES-BUILD Phase 2). The interactive read/add/delete surface
// for a Space owner's PERSONAL-DATA notes on one contact. The notes are fetched server-side
// (owner-gated) and passed in; this component only adds + deletes through the space-scoped, owner-
// gated server actions and refreshes. Both writes re-check authorization + scope server-side, so this
// form is convenience, not the gate.
//
// HONESTY (CONTENT-VOICE skeptic test): the panel says plainly that notes are private to the space.
// Plain labels, no narrated feelings, no em/en dashes (CONTENT-VOICE §10).

const sinceFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function ClientNotesPanel({
  spaceId,
  contactId,
  contactName,
  notes,
  readOnly = false,
}: {
  spaceId: string
  contactId: string
  contactName: string
  notes: ClientNote[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function add() {
    setError(null)
    const trimmed = body.trim()
    if (!trimmed) {
      setError('Write a note first.')
      return
    }
    start(async () => {
      const result = await addClientNote(spaceId, contactId, trimmed)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setBody('')
      router.refresh()
    })
  }

  function remove(noteId: string) {
    setError(null)
    start(async () => {
      const result = await deleteClientNote(spaceId, noteId)
      if (isError(result)) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <p className="text-sm font-semibold text-text">Notes on {contactName}</p>
        <p className="mt-0.5 text-xs text-muted">
          Private to this space. Only your team sees these.
        </p>

        {!readOnly && (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!pending) add()
            }}
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What you want to remember about this person."
              rows={3}
              maxLength={4000}
              aria-label={`Add a note about ${contactName}`}
            />
            {error && (
              <p
                className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger"
                role="alert"
              >
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" aria-hidden /> Add note
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={Check}
          title="No notes yet."
          description="Notes you add about this person show here, newest first."
        />
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <p className="whitespace-pre-wrap text-sm text-text">{note.body}</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-subtle">
                  {note.authorName ? `${note.authorName} · ` : ''}
                  {sinceFmt.format(new Date(note.createdAt))}
                </p>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => remove(note.id)}
                    disabled={pending}
                    aria-label="Delete this note"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
