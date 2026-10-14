'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { Av, EMPTY } from '../shared'
import type { StandingRow } from './standing-reads'

// The Standing leaderboard (templates/admin/Standing.html: the Leaderboard head with its flat tabs, then the
// table). The design's tabs are "This week / Season"; there is no weekly Zap tally, so the tabs are the two
// boards the platform keeps: this season's Zaps and lifetime Zaps. Both lists arrive from the server.

type Board = 'season' | 'all'

export function StandingLeaderboard({ season, allTime }: { season: StandingRow[]; allTime: StandingRow[] }) {
  const [board, setBoard] = useState<Board>('season')
  const rows = board === 'season' ? season : allTime
  return (
    <div>
      <div className="sec-h">
        <span className="h2">Leaderboard</span>
        <div className="tabs adp-flat" role="tablist" aria-label="Leaderboard">
          {(
            [
              ['season', 'Season'],
              ['all', 'All time'],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={board === key} className={board === key ? 'on' : undefined} onClick={() => setBoard(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel tbl-wrap" tabIndex={0} role="tabpanel" aria-label={board === 'season' ? 'Season leaderboard' : 'All-time leaderboard'}>
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Member</th>
              <th>Rank</th>
              <th>Streak</th>
              <th>Zaps</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="t1" colSpan={5}>
                  {board === 'season' ? 'No Zaps earned this season yet.' : 'No Zaps earned yet.'}
                </td>
              </tr>
            ) : (
              rows.map((p, i) => (
                <tr key={p.id}>
                  <td className="t1">{i + 1}</td>
                  <td>
                    <span className="row">
                      <Av url={p.avatarUrl} />
                      <Link className="t1" href={`/people/${p.handle}`}>
                        {p.name}
                      </Link>
                    </span>
                  </td>
                  <td>{p.rank ? <span className={i === 0 ? 'rank fq-iri-text on-light' : undefined}>{p.rank}</span> : EMPTY}</td>
                  <td>{p.streak.toLocaleString('en-US')}</td>
                  <td>
                    <FqIcon name="zap" size={14} /> {p.zaps.toLocaleString('en-US')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
