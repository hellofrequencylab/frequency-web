'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { CaptureBar } from '@/components/feed/capture-bar'
import { acceptFriendRequest, declineFriendRequest } from '@/app/(main)/people/friend-actions'
import { completeReminder } from '@/app/(main)/connections/actions'
import type { NeedItem } from '@/lib/feed/frequency-home'
import { fqToast } from '../shared/toast'
import { FqAvatar } from '../shared/avatar'
import { NEAR_EVENT } from './planner'
import { SystemNotice } from '../shared/system-notice'

// The Feed's small client islands. Each replaces one of the prototype's inline handlers with
// component state; every action that changes something is the platform's real one.

export { CreateButton } from './create-quick-action'
import { COMPOSE_EVENT } from './create-quick-action'

// ── Composer ──────────────────────────────────────────────────────────────────

export function FeedComposer({ scopeId, avatarUrl, name, practiceHref }: { scopeId: string; avatarUrl: string | null; name: string; practiceHref: string }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener(COMPOSE_EVENT, on)
    return () => window.removeEventListener(COMPOSE_EVENT, on)
  }, [])
  if (open) {
    return (
      <div id="compose" className="fa-capture">
        <CaptureBar scopeId={scopeId} visibility="public" placeholder="Share a moment with your people" canAnnounce={false} />
      </div>
    )
  }
  return (
    <div id="compose" className="fa-composer">
      <div className="fa-composer-top">
        <FqAvatar url={avatarUrl} name={name} />
        <button type="button" className="grow" onClick={() => setOpen(true)}>
          Share a moment with your people
        </button>
      </div>
      <div className="fa-composer-acts">
        <button type="button" onClick={() => setOpen(true)}>
          <FqIcon name="page" />
          Photo
        </button>
        <Link href="/events/new">
          <FqIcon name="event" />
          Event
        </Link>
        <Link href={practiceHref}>
          <FqIcon name="checkin" />
          Log practice
        </Link>
        <Link href="/classifieds/new">
          <FqIcon name="ticket" />
          Listing
        </Link>
      </div>
    </div>
  )
}

// ── Get started ───────────────────────────────────────────────────────────────
// Lives with the shell now (it leads the right rail, README §3.1); re-exported for the Feed's
// narrow-screen copy.

export { GetStarted, type GsStep } from '../shell/get-started'

// ── Needs you ─────────────────────────────────────────────────────────────────

export function NeedsYou({ items }: { items: NeedItem[] }) {
  const [left, setLeft] = useState(items)
  const [, start] = useTransition()
  const remove = (id: string, msg: string | null) => {
    setLeft((l) => l.filter((x) => x.id !== id))
    if (msg) fqToast(msg)
  }
  const run = (id: string, act: () => Promise<unknown>, msg: string) => {
    const before = left
    remove(id, null)
    start(async () => {
      try {
        const res = await act()
        if (res === false || (res && typeof res === 'object' && 'error' in res)) throw new Error('refused')
        fqToast(msg)
      } catch {
        setLeft(before)
        fqToast('That did not save. Try again.')
      }
    })
  }
  return (
    <>
      <div className="fa-sh">
        <span className="fa-h18">Needs you</span>
        <span className="fa-f13">{left.length ? `${left.length} waiting` : ''}</span>
      </div>
      <div className="list fa-needs">
        {left.map((n) => {
          if (n.kind === 'friend') {
            return (
              <div key={n.id}>
                <FqAvatar url={n.avatarUrl} name={n.name} />
                <span className="fa-rowtxt">
                  <span className="t1">{n.name} wants to connect</span>
                  <span className="t2">{n.handle ? `@${n.handle}` : 'Friend request'}</span>
                </span>
                <span className="fa-btns">
                  <button type="button" className="btn pa" onClick={() => run(n.id, () => acceptFriendRequest(n.requesterId), `You and ${first(n.name)} are connected.`)}>
                    Accept
                  </button>
                  <button type="button" className="btn" onClick={() => run(n.id, () => declineFriendRequest(n.requesterId), 'Request declined.')}>
                    Not now
                  </button>
                </span>
              </div>
            )
          }
          if (n.kind === 'reach') {
            return (
              <div key={n.id}>
                <span className="fa-icav" aria-hidden>
                  <FqIcon name="contacts" />
                </span>
                <span className="fa-rowtxt">
                  <span className="t1">You said you’d check in with {n.name}</span>
                  <span className="t2">{n.note ?? n.dueLine}</span>
                </span>
                <span className="fa-btns">
                  <Link href={`/connections/${n.contactId}`} className="btn pa">
                    Say hi
                  </Link>
                  <button type="button" className="btn" onClick={() => run(n.id, () => completeReminder(n.id.slice('reach:'.length), n.contactId), `Marked done for ${first(n.name)}.`)}>
                    Done
                  </button>
                </span>
              </div>
            )
          }
          return (
            <div key={n.id}>
              <span className="fa-icav" aria-hidden>
                <FqIcon name="program" />
              </span>
              <span className="fa-rowtxt">
                <span className="t1">{n.title}</span>
                <span className="t2">{n.journey} · next lesson</span>
              </span>
              <span className="fa-btns">
                <Link href={n.href} className="btn pa">
                  Start
                </Link>
                <button type="button" className="btn" onClick={() => remove(n.id, 'It’ll be here next time.')}>
                  Later
                </button>
              </span>
            </div>
          )
        })}
      </div>
      {left.length === 0 && (
        <SystemNotice
          icon="check"
          title="All clear. Nobody’s waiting on you."
          body="Reach out to someone, or put something on the calendar."
          actions={[
            { href: '/connections', label: 'Your contacts' },
            { href: '/events/new', label: 'Add an event', primary: true },
          ]}
        />
      )}
    </>
  )
}

function first(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

// ── Caught up ─────────────────────────────────────────────────────────────────

export function CaughtUpButton() {
  return (
    <button type="button" className="btn" onClick={() => window.dispatchEvent(new Event(NEAR_EVENT))}>
      Find something for tonight
    </button>
  )
}
