'use client'

import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react'
import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { CaptureBar } from '@/components/feed/capture-bar'
import { acceptFriendRequest, declineFriendRequest } from '@/app/(main)/people/friend-actions'
import { completeReminder } from '@/app/(main)/connections/actions'
import type { NeedItem } from '@/lib/feed/frequency-home'
import { fqToast } from '../shared/toast'
import { FqAvatar } from '../shared/avatar'
import { NEAR_EVENT } from './planner'

// The Feed's small client islands. Each replaces one of the prototype's inline handlers with
// component state; every action that changes something is the platform's real one.

// ── Create ────────────────────────────────────────────────────────────────────

const CREATE: { label: string; sub: string; href: string; icon: FqIconName }[] = [
  { label: 'Post', sub: 'To your wall and the feed', href: '#compose', icon: 'page' },
  { label: 'Event', sub: 'Vera can draft from a poster', href: '/events/new', icon: 'event' },
  { label: 'Circle', sub: 'Start from a template', href: '/circles/new', icon: 'circle' },
  { label: 'Practice', sub: 'Write one or fork one', href: '/practices/new', icon: 'checkin' },
  { label: 'Journey', sub: 'Phases, modules, lessons', href: '/journeys/new', icon: 'program' },
  { label: 'Listing', sub: 'Market, Classifieds, Housing', href: '/classifieds/new', icon: 'ticket' },
]

export function CreateButton() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', out)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div ref={ref} className="fa-pop">
      <button type="button" className="fa-create fq-iri-rim" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <b aria-hidden>+</b>Create
      </button>
      {open && (
        <div className="fa-menu">
          {CREATE.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              onClick={() => {
                setOpen(false)
                if (c.href === '#compose') window.dispatchEvent(new Event(COMPOSE_EVENT))
              }}
            >
              <FqIcon name={c.icon} />
              <span>
                <b>{c.label}</b>
                <small>{c.sub}</small>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Composer ──────────────────────────────────────────────────────────────────

const COMPOSE_EVENT = 'fq:compose'

/** The glass pill. Tapping it opens the platform's real Capture box (post, poll, ask, photo...)
 *  in place; Event, Log practice and Listing go to their own create flows. */
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
      <FqAvatar url={avatarUrl} name={name} />
      <button type="button" className="grow" onClick={() => setOpen(true)}>
        Share a moment with your people
      </button>
      <button type="button" className="ap-ic" title="Photo" aria-label="Photo" onClick={() => setOpen(true)}>
        <FqIcon name="page" />
      </button>
      <Link className="ap-ic" href="/events/new" title="Event" aria-label="Event">
        <FqIcon name="event" />
      </Link>
      <Link className="ap-ic" href={practiceHref} title="Log practice" aria-label="Log practice">
        <FqIcon name="checkin" />
      </Link>
      <Link className="ap-ic" href="/classifieds/new" title="Listing" aria-label="Listing">
        <FqIcon name="ticket" />
      </Link>
    </div>
  )
}

// ── Get started ───────────────────────────────────────────────────────────────

export interface GsStep {
  key: string
  label: string
  blurb: string
  cta: string
  href: string
  done: boolean
}

/** The activation checklist (lib/onboarding/status.ts), drawn as the design's Get started box.
 *  Each CTA opens the step's real flow; done-ness is detected server-side from member state.
 *  × folds the box away for this visit: the platform keeps the guide until the steps are done. */
export function GetStarted({ steps }: { steps: GsStep[] }) {
  const [hidden, setHidden] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const done = steps.filter((s) => s.done).length
  const firstTodo = steps.find((s) => !s.done)?.key ?? null
  const active = open ?? firstTodo
  if (hidden || steps.length === 0) return null
  const left = steps.length - done
  const later = (key: string) => {
    const i = steps.findIndex((s) => s.key === key)
    const next = [...steps.slice(i + 1), ...steps.slice(0, i)].find((s) => !s.done)
    setOpen(next ? next.key : null)
  }
  return (
    <section className="panel fa-gs" aria-label="Get started">
      <div className="fq-aura" aria-hidden />
      <div className="fa-gs-h">
        <span className="fa-gs-ring" data-n={`${done}/${steps.length}`} style={{ '--p': `${Math.round((done / steps.length) * 100)}%` } as CSSProperties} aria-hidden />
        <span className="grow">
          <b>Get started</b>
          <span className="t2">{left === 0 ? 'All done' : `Set up your network · ${left} left`}</span>
        </span>
        <button type="button" className="fa-x" aria-label="Hide for now" onClick={() => setHidden(true)}>
          <FqIcon name="close" />
        </button>
      </div>
      <div className="fa-steps">
        {steps.map((s) => {
          const now = !s.done && active === s.key
          return (
            <div key={s.key} className={s.done ? 'fa-step done' : now ? 'fa-step now' : 'fa-step'}>
              <button type="button" aria-expanded={now} disabled={s.done} onClick={() => setOpen(s.key)}>
                <span className={now ? 'fa-mark fq-breathe' : 'fa-mark'} aria-hidden>
                  {s.done && <FqIcon name="checkin" />}
                </span>
                {s.label}
              </button>
              {now && (
                <div className="fa-step-open">
                  <p>{s.blurb}</p>
                  <div className="row">
                    <Link href={s.href} className="btn pa">
                      {s.cta}
                    </Link>
                    <button type="button" className="btn txt sm" onClick={() => later(s.key)}>
                      Later
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

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
      {left.length === 0 && <div className="fa-allclear fa-serif18">All clear. Nobody’s waiting on you.</div>}
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
