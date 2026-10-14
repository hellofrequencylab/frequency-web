'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Av } from '../shared'
import { Input } from '@/components/ui/field'

// The Contacts chip bar, search, table and Export (templates/admin/Contacts.html). A thin client island over
// rows the server already read and shaped (contacts-body.tsx): the chips and the search filter in the
// browser, nothing is fetched here. Last visit and Visits arrive as display strings (the design's empty
// value when there is no reading).

export type ContactTone = 'ok' | 'warn' | 'bad' | 'n'

export interface ContactRow {
  id: string
  name: string
  sub: string
  avatarUrl: string | null
  lastVisit: string
  visits: string
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
        <Input
          className="adp-search"
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
                  <td>{r.lastVisit}</td>
                  <td>{r.visits}</td>
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

/** One CSV cell: quoted when it holds a comma, quote or line break; a leading formula character is
 *  neutralised so a spreadsheet never runs it. */
function cell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** The head's Export: every row on the page as a CSV file, written in the browser from what the server
 *  already sent. Nothing is fetched. */
export function ExportContactsButton({ rows, filename }: { rows: ContactRow[]; filename: string }) {
  function download() {
    const lines = [
      ['Name', 'Handle or email', 'Last visit', 'Visits', 'Source', 'Status'],
      ...rows.map((r) => [r.name, r.sub, r.lastVisit, r.visits, r.source, r.status.label]),
    ].map((line) => line.map(cell).join(','))
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button type="button" className="btn" disabled={rows.length === 0} onClick={download}>
      Export
    </button>
  )
}
