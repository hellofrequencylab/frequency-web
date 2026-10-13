'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { setUpSpaceInboxAddress, checkSpaceInboxAddressAction } from '@/app/(main)/spaces/[slug]/settings/email/inbox-actions'
import { inboxStateLabel, type SpaceInboxState } from '@/lib/comms/space-inbox-address-core'

// "YOUR SPACE ADDRESS" (EMAIL-022). Every Space, every plan: one public address, hello@<slug>.<root>,
// one button. The server does the DNS; the owner sees a state word and a sentence. Mounted only when
// SPACE_INBOX_ADDRESSES_ENABLED is on (the server component decides). VOICE: plain labels, no narrated
// feelings, no em dashes.
export function SpaceInboxAddressCard({ spaceId, slug, address, state: initialState, readOnly = false }: {
  spaceId: string
  slug: string
  /** The address the Space would get, shown before setup too so the owner knows what they are pressing for. */
  address: string
  state: SpaceInboxState | null
  readOnly?: boolean
}) {
  const [state, setState] = useState<SpaceInboxState | null>(initialState)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const label = inboxStateLabel(state)
  const canSetUp = !readOnly && state !== 'verified' && state !== 'paused'
  const canCheck = !readOnly && state === 'pending'
  function run(task: () => ReturnType<typeof setUpSpaceInboxAddress>) {
    if (pending) return
    setError('')
    setMessage('')
    start(async () => {
      const r = await task()
      if (isError(r)) { setError(r.error); return }
      setState(r.data.state)
      setMessage(r.data.message)
    })
  }
  return (
    <section className="space-y-4 rounded-card border border-border bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-body font-semibold text-text">Your Space address</h2>
        <span className="text-body-sm text-muted" role="status">{label}</span>
      </div>
      <p className="break-all font-mono text-body-sm text-text">{address}</p>
      <p className="text-body-sm text-muted">
        People can write to this address and their message lands in your Conversations. Once it is ready, your replies go out from it, and it is the Reply-To we recommend for anything you send from this Space.
      </p>
      {state === 'pending' && <p className="text-body-sm text-muted">Your address is finishing setting up on its own. DNS can take a few minutes, and you can leave this page; it will be ready when you come back.</p>}
      {state === 'paused' && <p className="text-body-sm text-muted">This address is paused. Write to support to switch it back on.</p>}
      <div className="flex flex-wrap gap-2">
        {canSetUp && (
          <Button disabled={pending} onClick={() => run(() => setUpSpaceInboxAddress(spaceId, slug))}>
            {state === 'failed' ? 'Set up my address again' : 'Set up my address'}
          </Button>
        )}
        {canCheck && (
          <Button variant="ghost" disabled={pending} onClick={() => run(() => checkSpaceInboxAddressAction(spaceId, slug))}>
            Check again
          </Button>
        )}
      </div>
      {pending && <p role="status" className="text-body-sm text-muted">Setting up your address…</p>}
      {message && <p role="status" className="text-body-sm text-muted">{message}</p>}
      {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
    </section>
  )
}
