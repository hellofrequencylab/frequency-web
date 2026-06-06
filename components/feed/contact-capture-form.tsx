'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { UserPlus, ScanLine, Check } from 'lucide-react'
import { createProfile } from '@/app/(main)/connections/actions'

// Contact capture — the headline of Capture (the rework): get a person's details
// into your personal CRM in seconds. On web this is manual entry (you won't shoot
// a card on a laptop); the card/poster *scan* path lives one tap away at
// /connections/new. Saves a private, owner-scoped contact (member-tier, §5.2).

const input =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-broadcast'

export function ContactCaptureForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [savedName, setSavedName] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function save() {
    const displayName = name.trim()
    if (!displayName || pending) return
    setError('')
    start(async () => {
      const res = await createProfile({
        source: 'manual',
        displayName,
        email: email.trim() || undefined,
        connectionNote: note.trim() || undefined,
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSavedName(displayName)
      setName('')
      setEmail('')
      setNote('')
    })
  }

  if (savedName) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-broadcast-bg text-broadcast-strong">
          <Check className="h-5 w-5" strokeWidth={3} aria-hidden />
        </span>
        <p className="text-sm font-semibold text-text">{savedName} is in your contacts</p>
        <div className="mt-1 flex items-center gap-3 text-xs font-semibold">
          <button type="button" onClick={() => setSavedName(null)} className="text-broadcast-strong hover:underline">
            Capture another
          </button>
          <Link href="/connections" className="text-subtle hover:text-text">
            View contacts
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-3">
      <input className={input} placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <input className={input} placeholder="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <textarea
        className={`${input} resize-none`}
        rows={2}
        placeholder="Where you met, what to remember…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/connections/new"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-subtle transition-colors hover:text-text"
        >
          <ScanLine className="h-3.5 w-3.5" aria-hidden /> Scan a card instead
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={!name.trim() || pending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden /> {pending ? 'Saving…' : 'Capture'}
        </button>
      </div>
    </div>
  )
}
