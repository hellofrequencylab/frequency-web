'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { FqAvatar } from '../shared/avatar'
import { Input } from '@/components/ui/field'

// The thread list and its tabs (the design's data-group tabs, as component state). The design's
// "Requests" tab has no message-request concept behind it, so the tabs are All, People (direct
// and group DMs) and Rooms.
//
// THE HYBRID RULE (owner, design pass): the DAWN inbox also finds a thread by name, sorts by
// Latest / Unread / A to Z and shows who is online now. They stay, in the kit: a find field under
// the tabs, a three-way switch beside it, and the presence dot on a person's photo. All three work
// on the list the server already read, so they cost no round trip.

export interface ThreadLite {
  key: string
  kind: 'dm' | 'group' | 'room'
  href: string
  name: string
  avatarUrl: string | null
  preview: string
  /** Relative time, written on the server so the first paint matches. */
  when: string | null
  unread: number
  /** The DM peer is online now (the inbox's presence read). */
  online?: boolean
  /** Position in the server's latest-activity order, so Latest restores it exactly. */
  order: number
}

const TABS = [
  ['all', 'All'],
  ['people', 'People'],
  ['rooms', 'Rooms'],
] as const

const SORTS = [
  ['latest', 'Latest'],
  ['unread', 'Unread'],
  ['az', 'A to Z'],
] as const

export function InboxList({ threads, activeKey }: { threads: ThreadLite[]; activeKey: string | null }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('all')
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>('latest')
  const [find, setFind] = useState('')
  const q = find.trim().toLowerCase()

  const shown = useMemo(() => {
    const rows = threads
      .filter((t) => tab === 'all' || (tab === 'rooms' ? t.kind === 'room' : t.kind !== 'room'))
      .filter((t) => !q || `${t.name} ${t.preview}`.toLowerCase().includes(q))
    if (sort === 'az') return [...rows].sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'unread') return [...rows].sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || a.order - b.order)
    return [...rows].sort((a, b) => a.order - b.order)
  }, [threads, tab, sort, q])

  return (
    <>
      <div className="tabs" role="group" aria-label="Show">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" className={tab === k ? 'on' : undefined} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="row fqm-inbox-tools">
        <label className="fqm-find grow">
          <FqIcon name="search" />
          <Input variant="seamless" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a conversation" aria-label="Find a conversation" />
        </label>
      </div>
      <div className="fqm-seg" role="group" aria-label="Sort">
        {SORTS.map(([k, label]) => (
          <button key={k} type="button" className={sort === k ? 'on' : undefined} aria-pressed={sort === k} onClick={() => setSort(k)}>
            {label}
          </button>
        ))}
      </div>
      <nav className="stack sel fa-threads" aria-label="Conversations">
        {shown.map((t) => (
          <Link key={t.key} href={t.href} className={[t.key === activeKey ? 'on' : '', t.unread > 0 ? 'fa-unread' : ''].filter(Boolean).join(' ') || undefined} aria-current={t.key === activeKey ? 'page' : undefined}>
            {t.kind === 'room' || t.kind === 'group' ? (
              <span className="ic fqm-ic-round" aria-hidden>
                <FqIcon name={t.kind === 'room' ? 'circle' : 'contacts'} />
              </span>
            ) : (
              <span className="fqm-presence">
                <FqAvatar url={t.avatarUrl} name={t.name} size="m" />
                {t.online && <i aria-label="Online now" />}
              </span>
            )}
            <span className="grow">
              <span className="t1">
                <span>{t.name}</span>
                {t.when && <span className="t2">{t.when}</span>}
              </span>
              <span className="t2">{t.preview}</span>
            </span>
            {t.unread > 0 && <span className="dot" aria-label={`${t.unread} unread`} />}
          </Link>
        ))}
        {shown.length === 0 &&
          (q ? (
            <p className="why fqm-pad" role="status">
              Nothing matches that.{' '}
              <button type="button" className="btn txt sm" onClick={() => setFind('')}>
                Clear
              </button>
            </p>
          ) : tab === 'rooms' ? (
            <p className="why fqm-pad">No rooms joined yet. Start one with Room, or join an open one.</p>
          ) : (
            <div className="stack fqm-pad fqm-gap-sm">
              <p className="why">No conversations yet.</p>
              <span className="t2">Say hi to someone you met. Their profile has a Message button.</span>
              <Link className="btn sm fqm-tag-start" href="/network">
                Find people
              </Link>
            </div>
          ))}
      </nav>
    </>
  )
}
