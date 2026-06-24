'use client'

import { useState, useTransition } from 'react'
import { Loader2, Ban, MailCheck, StickyNote, Pencil, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { setContactConsent, addContactNote, updateContactFields } from '../actions'

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

/** Edit the SAFE fields on a contact (ADR-379): name, city, and the source label.
 *  Email is read-only here (it's the identity stitch key, ADR-130). The form starts
 *  collapsed and only submits the three allowlisted fields. */
export function EditContactFields({
  contactId,
  email,
  displayName,
  city,
  source,
}: {
  contactId: string
  email: string
  displayName: string | null
  city: string | null
  source: string | null
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [name, setName] = useState(displayName ?? '')
  const [cityValue, setCityValue] = useState(city ?? '')
  const [sourceValue, setSourceValue] = useState(source ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" /> Edit fields
      </Button>
    )
  }

  function save() {
    setMsg(null)
    start(async () => {
      const res = await updateContactFields(contactId, {
        display_name: name,
        city: cityValue,
        source: sourceValue,
      })
      if (res.ok) {
        setMsg({ ok: true, text: 'Saved.' })
        setOpen(false)
      } else {
        setMsg({ ok: false, text: 'Could not save the changes.' })
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-text">Edit contact fields</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="contact-name">Name</Label>
          <Input
            id="contact-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="contact-city">City</Label>
          <Input
            id="contact-city"
            value={cityValue}
            onChange={(e) => setCityValue(e.target.value)}
            placeholder="City"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="contact-source">Source</Label>
          <Input
            id="contact-source"
            value={sourceValue}
            onChange={(e) => setSourceValue(e.target.value)}
            placeholder="e.g. beta_waitlist"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="contact-email">Email</Label>
          <Input id="contact-email" value={email} disabled className="mt-1" />
          <p className="mt-1 text-2xs text-subtle">Email is the join key and can&apos;t be edited here.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save changes
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-success' : 'text-muted'}`}>{msg.text}</span>}
      </div>
    </div>
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
