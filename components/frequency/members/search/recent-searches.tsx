'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'

// The reference's "Recent" panel (templates/members/Search.html). The platform keeps no search
// history, so this is the viewer's own, on this device only: each search of two letters or more is
// remembered in localStorage (a per-viewer convenience, never shared, never read by the server), the
// last six show here, and Clear forgets them. Storage can be blocked; then the panel simply hides.

const KEY = 'fq-recent-searches'
const MAX = 6

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

function write(list: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    // Storage blocked: nothing to remember.
  }
}

export function FqRecentSearches({ current }: { current: string }) {
  const [list, setList] = useState<string[]>([])

  useEffect(() => {
    const q = current.trim()
    const prev = read()
    const next = q.length >= 2 ? [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX) : prev
    if (q.length >= 2) write(next)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setList(next.filter((x) => x.toLowerCase() !== q.toLowerCase()))
  }, [current])

  if (list.length === 0) return null
  return (
    <div className="panel stack">
      <div className="sec-h fqm-sec-h0">
        <span className="k">Recent</span>
        <button
          type="button"
          className="btn sm txt"
          onClick={() => {
            write([])
            setList([])
          }}
        >
          Clear
        </button>
      </div>
      <div className="list">
        {list.map((q) => (
          <Link key={q} href={`/search?q=${encodeURIComponent(q)}`}>
            <span className="ic">
              <FqIcon name="search" />
            </span>
            <span className="t1 grow">{q}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
