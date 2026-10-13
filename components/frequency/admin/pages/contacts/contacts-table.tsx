'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Av, EMPTY } from '../shared'

// The Contacts chip bar, search and table (templates/admin/Contacts.html). A thin client island over rows the
// server already read and shaped (contacts-body.tsx): the chips and the search filter in the browser, nothing
// is fetched here. The two columns the platform has no reading for (Last visit, Visits) show the design's
// empty value.

export type ContactTone = 'ok' | 'warn' | 'bad' | 'n'

export interface ContactRow {
  id: string
  name: string
  sub: string
  avatarUrl: string | null
  source: 'Member' | 'Contact'
  status: { label: string; tone: ContactTone }
  href: string
  active: boolean
  firstTimer: boolean
  slipping: boolean
}

type ChipKey = 'all' | 'active' | 'first' | 'slipping' | 'members'

const CHIPS: { key: ChipKey; label: string; test: (r: ContactRow) => boolean }[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'active', label: 'Active', test: (r) => r.active },
  { key: 'first', label: 'First timers', test: (r) => r.firstTimer },
  { key: 'slipping', label: 'Slipping', test: (r) => r.slipping },
  { key: 'members', label: 'Members', test: (r) => r.source === 'Member' },
]

const PAGE = 50

export function ContactsTable({ rows }: { rows: ContactRow[] }) {
  const [chip, setChip] = useState<ChipKey>('all')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const counts = useMemo(
    () => Object.fromEntries(CHIPS.map((c) => [c.key, rows.filter(c.test).length])) as Record<ChipKey, number>,
    [rows],
  )
  const shown = useMemo(() => {
    const test = CHIPS.find((c) => c.key === chip)?.test ?? (() => true)
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => test(r) && (!needle || r.name.toLowerCase().includes(needle) || r.sub.toLowerCase().includes(needle)))
  }, [rows, chip, q])

  return (
    <>
      <div className="row wrap adp-filters">
        <div className="chips" role="group" aria-label="Filter contacts">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={chip === c.key ? 'chip on' : 'chip'}
              aria-pressed={chip === c.key}
              onClick={() => {
                setChip(c.key)
                setLimit(PAGE)
              }}
            >
              {c.label} {counts[c.key].toLocaleString('en-US')}
            </button>
          ))}
        </div>
        <span className="ap-sp" />
        <input
          className="input adp-search"
          type="search"
          placeholder="Search contacts"
          aria-label="Search contacts"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setLimit(PAGE)
          }}
        />
      </div>

      <div className="panel tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Last visit</th>
              <th>Visits</th>
              <th>Source</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td className="t1" colSpan={6}>
                  {rows.length === 0 ? 'No members or contacts yet.' : 'No one matches. Try another filter.'}
                </td>
              </tr>
            ) : (
              shown.slice(0, limit).map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="row">
                      <Av url={r.avatarUrl} />
                      <span>
                        <span className="t1 adp-block">{r.name}</span>
                        <span className="t2">{r.sub}</span>
                      </span>
                    </span>
                  </td>
                  <td>{EMPTY}</td>
                  <td>{EMPTY}</td>
                  <td>
                    <span className="tag">{r.source}</span>
                  </td>
                  <td>
                    <span className={`st ${r.status.tone}`}>{r.status.label}</span>
                  </td>
                  <td>
                    <Link className="btn sm txt" href={r.href}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {shown.length > limit && (
        <div className="row adp-gap">
          <button type="button" className="btn sm" onClick={() => setLimit((l) => l + PAGE)}>
            Show more
          </button>
        </div>
      )}
    </>
  )
}
