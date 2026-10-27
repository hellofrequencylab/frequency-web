'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'
import '@/app/themes/active/members-b'
import '@/app/themes/active/members-circle'
import { FqIcon } from '@/components/frequency/icon'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'

// CIRCLE MEMBERS PANE (templates/circles/Circles.dc.html, the Members tab): a search field and the
// Everyone / New filter, "Holding the circle" (host, admins, moderators), the nudge slot, "Everyone" as a
// grid of tiles, and the seats card. The page keeps the reads and the gates; a manager's role picker rides
// under each tile it may change, exactly as it does under DAWN. There is no Friends filter: the roster read
// does not know who the viewer's friends are, and a chip that filters nothing is worse than none.

type FqRosterPerson = {
  id: string
  handle: string
  name: string
  avatarUrl: string | null
  /** The role line: Host, Admin, Moderator, New or Member. */
  role: string
  /** Holds the circle: the host, an Admin or a Moderator. */
  holding: boolean
  /** Joined inside the greeting strip's own window. */
  isNew: boolean
  /** The role picker, for a viewer who may set this member's role. */
  control?: ReactNode
}

type Filter = 'everyone' | 'new'

export function FqMembersPane({
  people,
  seatsLine,
  seatsOpen,
  empty,
  legend,
  youAreHere,
  nudges = null,
  invite = null,
}: {
  people: FqRosterPerson[]
  seatsLine: string
  /** Seats left, for the seats card; 0 hides the card. */
  seatsOpen: number
  /** Rendered instead of the grid when the host is the only one here. */
  empty: ReactNode | null
  legend: ReactNode
  youAreHere: boolean
  /** The "Keep someone's streak going" section, for a member. */
  nudges?: ReactNode
  /** The invite button for the seats card. */
  invite?: ReactNode
}) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('everyone')
  const needle = q.trim().toLowerCase()
  const shown = useMemo(
    () =>
      people.filter(
        (p) => (filter === 'new' ? p.isNew : true) && (!needle || p.name.toLowerCase().includes(needle) || p.handle.toLowerCase().includes(needle)),
      ),
    [people, filter, needle],
  )
  const holding = shown.filter((p) => p.holding)
  const rest = shown.filter((p) => !p.holding)
  return (
    <section aria-label="Members" className="stack fqc-members">
      {empty ?? (
        <>
          <div className="fqc-find">
            <label className="fqc-search">
              <FqIcon name="search" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${people.length} members`}
                aria-label={`Search ${people.length} members`}
              />
            </label>
            <div className="fqc-chips" role="group" aria-label="Filter members">
              {(['everyone', 'new'] as const).map((f) => (
                <button key={f} type="button" className={filter === f ? 'fqc-fchip on' : 'fqc-fchip'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === 'everyone' ? 'Everyone' : 'New'}
                </button>
              ))}
            </div>
          </div>

          {holding.length > 0 && (
            <div className="stack fqc-sec">
              <h2 className="h2">Holding the circle</h2>
              <div className="fqc-hold">
                {holding.map((p) => (
                  <div key={p.id} className="fqc-card">
                    <Link className="fqc-card-main" href={`/people/${p.handle}`}>
                      <FqAvatar url={p.avatarUrl} name={p.name} size="m" />
                      <span>
                        <span className="t1 fqm-block">{p.name}</span>
                        <span className="t2">{p.role}</span>
                      </span>
                    </Link>
                    {p.control}
                  </div>
                ))}
              </div>
            </div>
          )}

          {nudges}

          <div className="stack fqc-sec">
            <div className="sec-h fqm-sec-h0">
              <h2 className="h2">Everyone</h2>
              <span className="t2">
                {people.length} {people.length === 1 ? 'person' : 'people'}
              </span>
            </div>
            {rest.length === 0 ? (
              <p className="why">{needle || filter === 'new' ? 'Nobody matches that.' : 'Just the people holding the circle, so far.'}</p>
            ) : (
              <div className="fqc-all">
                {rest.map((p) => (
                  <div key={p.id} className="fqc-card">
                    <Link className="fqc-card-main" href={`/people/${p.handle}`}>
                      <FqAvatar url={p.avatarUrl} name={p.name} />
                      <span>
                        <span className="t1 fqm-block">{p.name}</span>
                        <span className="t2">{p.isNew ? 'Joined this week' : p.role}</span>
                      </span>
                    </Link>
                    {p.control}
                  </div>
                ))}
              </div>
            )}
          </div>

          {seatsOpen > 0 && (
            <div className="fqc-seats">
              <div>
                <span className="h3">
                  {seatsOpen} {seatsOpen === 1 ? 'seat' : 'seats'} left
                </span>
                <p className="fqc-sec-sub">Small on purpose. When it fills, the host can seed a sister circle nearby.</p>
              </div>
              {invite}
            </div>
          )}
        </>
      )}
      {legend}
      {youAreHere && <p className="t2">You are in this circle.</p>}
      {seatsOpen === 0 && !empty && <p className="meta">{seatsLine}</p>}
    </section>
  )
}
