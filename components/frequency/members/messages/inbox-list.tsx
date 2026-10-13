'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { FqAvatar } from '../shared/avatar'

// The thread list and its tabs (the design's data-group tabs, as component state). The design's
// "Requests" tab has no message-request concept behind it, so the tabs are All, People (direct
// and group DMs) and Rooms.

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
}

const TABS = [
  ['all', 'All'],
  ['people', 'People'],
  ['rooms', 'Rooms'],
] as const

export function InboxList({ threads, activeKey }: { threads: ThreadLite[]; activeKey: string | null }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('all')
  const shown = threads.filter((t) => tab === 'all' || (tab === 'rooms' ? t.kind === 'room' : t.kind !== 'room'))
  return (
    <>
      <div className="tabs" role="group" aria-label="Show">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" className={tab === k ? 'on' : undefined} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <nav className="stack sel fa-threads" aria-label="Conversations">
        {shown.map((t) => (
          <Link key={t.key} href={t.href} className={[t.key === activeKey ? 'on' : '', t.unread > 0 ? 'fa-unread' : ''].filter(Boolean).join(' ') || undefined} aria-current={t.key === activeKey ? 'page' : undefined}>
            {t.kind === 'room' || t.kind === 'group' ? (
              <span className="ic" aria-hidden style={{ width: 48, height: 48, borderRadius: '50%' }}>
                <FqIcon name={t.kind === 'room' ? 'circle' : 'contacts'} />
              </span>
            ) : (
              <FqAvatar url={t.avatarUrl} name={t.name} size="m" />
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
        {shown.length === 0 && <p className="why" style={{ padding: 14 }}>{tab === 'rooms' ? 'No rooms joined yet.' : 'No conversations yet.'}</p>}
      </nav>
    </>
  )
}
