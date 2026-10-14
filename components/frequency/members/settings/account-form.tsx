'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { updateProfile } from '@/app/(main)/settings/profile/actions'
import { fqToast } from '@/components/frequency/members/shell/toast'
import { Input, Textarea } from '@/components/ui/field'
import { FqIcon } from '@/components/frequency/icon'

// The reference's Account pane (Settings.html): Name, Email, About you, Save. It saves through the
// SAME action as the full profile editor (updateProfile). That action writes phone, city and website
// on every call, so this form carries the member's current values for them through unchanged; the
// photo and the handle stay on /settings/profile, where their own controls live. Email is the sign-in
// address, shown, not edited here.

interface Initial {
  displayName: string
  handle: string
  bio: string
  phone: string
  city: string
  website: string
}

export function AccountForm({ initial, email }: { initial: Initial; email: string | null }) {
  const [name, setName] = useState(initial.displayName)
  const [bio, setBio] = useState(initial.bio)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <form
      className="stack mc-gap-20"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        start(async () => {
          try {
            await updateProfile({
              displayName: name,
              handle: initial.handle,
              bio,
              avatarUrl: '',
              phone: initial.phone,
              city: initial.city,
              website: initial.website,
            })
            fqToast('Saved')
          } catch (err) {
            setError(err instanceof Error ? err.message : 'That did not save. Try again.')
          }
        })
      }}
    >
      <div className="g2">
        <div className="field">
          <label htmlFor="fq-account-name">Name</label>
          <Input id="fq-account-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </div>
        <div className="field">
          <label htmlFor="fq-account-email">Email</label>
          <Input id="fq-account-email" value={email ?? ''} readOnly aria-describedby="fq-account-email-note" />
          <span id="fq-account-email-note" className="t2">
            The address you sign in with.
          </span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="fq-account-bio">About you</label>
        <Textarea id="fq-account-bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} />
      </div>
      {error && (
        <p className="t2" role="alert">
          {error}
        </p>
      )}
      <div className="row wrap">
        <button type="submit" className="btn pa" disabled={pending}>
          <FqIcon name="check" />
          {pending ? 'Saving' : 'Save'}
        </button>
        <Link className="btn txt" href="/settings/profile">
          Handle, photo, links and your Spotlight page
        </Link>
      </div>
    </form>
  )
}
