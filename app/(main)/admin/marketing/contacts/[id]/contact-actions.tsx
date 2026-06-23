'use client'

import { useState, useTransition } from 'react'
import { Loader2, Ban, MailCheck, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setContactConsent, addContactNote } from '../actions'

// Staff command controls on the admin person page (CRM admin suite). Both call the staff-gated
// server actions in ../actions.ts. Optimistic-ish local state keeps the button label honest between
// the action returning and the server revalidation landing.

/** Toggle a contact's marketing consent. Unsubscribing stops campaigns to that address. */
export function ConsentToggle({ contactId, state }: { contactId: string; state: string }) {
  const [pending, start] = useTransition()
  const [current, setCurrent] = useState(state)
  const isUnsub = current === 'unsubscribed'
  function toggle() {
    const next = isUnsub ? 'subscribed' : 'unsubscribed'
    start(async () => {
      await setContactConsent(contactId, next)
      setCurrent(next)
    })
  }
  return (
    <Button type="button" onClick={toggle} disabled={pending}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isUnsub ? (
        <MailCheck className="h-4 w-4" />
      ) : (
        <Ban className="h-4 w-4" />
      )}
      {isUnsub ? 'Mark subscribed' : 'Mark unsubscribed'}
    </Button>
  )
}

/** Add a staff note to the person's timeline. */
export function AddNote({ contactId }: { contactId: string }) {
  const [pending, start] = useTransition()
  const [body, setBody] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  function submit() {
    const text = body.trim()
    if (!text) return
    setMsg(null)
    start(async () => {
      const res = await addContactNote(contactId, text)
      if (res.ok) {
        setBody('')
        setMsg({ ok: true, text: 'Note added.' })
      } else {
        setMsg({ ok: false, text: 'Could not add the note.' })
      }
    })
  }
  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface p-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Add a staff note about this person…"
        className="w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder-subtle focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong/30"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button type="button" onClick={submit} disabled={pending || !body.trim()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />}
          Add note
        </Button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-success' : 'text-muted'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
