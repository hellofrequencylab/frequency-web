'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import type { ZapRow } from '@/lib/feed/frequency-home'

// STANDING: four tappable numbers (streak, Zaps this season, Gems, season rank) over one glass
// panel that swaps by stat. The numbers count up over 1100ms (ease-out cubic) unless the member
// asked for reduced motion. Every value is the member's own: lib/member-progress.ts and the
// practice-streak state, the Zap ledger for the breakdown, the rank ladder in lib/season-ranks.ts.

type Stat = 'streak' | 'zaps' | 'gems' | 'rank'

export interface StandingProps {
  streak: number
  loggedToday: boolean
  atRisk: boolean
  freezeTokens: number
  nextMilestone: { day: number; label: string } | null
  toNext: number
  zaps: number
  gems: number
  rankLabel: string
  /** The ladder in order, with whether each rung is reached. */
  ranks: { label: string; reached: boolean }[]
  journeysFinished: number
  nextRankLabel: string | null
  journeysToNext: number | null
  zapRows: ZapRow[]
  tuneOutHref: string
  /** Today's weekday (0 = Sunday) in the community's zone, so the chain's letters match the server. */
  todayDow: number
}

function useCountUp(target: number): number {
  const [t, setT] = useState(1)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1100)
      setT(1 - Math.pow(1 - p, 3))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return Math.round(target * t)
}

export function Standing(props: StandingProps) {
  const [stat, setStat] = useState<Stat>('streak')
  const streak = useCountUp(props.streak)
  const zaps = useCountUp(props.zaps)
  const gems = useCountUp(props.gems)

  const stats: { k: Stat; label: string; val: number | string; glyph: string }[] = [
    { k: 'streak', label: 'Day streak', val: streak, glyph: '' },
    { k: 'zaps', label: 'Zaps this season', val: zaps, glyph: '⚡' },
    { k: 'gems', label: 'Gems to spend', val: gems, glyph: '💎' },
    { k: 'rank', label: 'Season rank', val: props.rankLabel, glyph: '' },
  ]

  // The seven-day chain, derived from the streak itself: a run of N days ending today (logged) or
  // yesterday (today still open) means those N days were logged. No other day data is read.
  const doneBefore = Math.min(6, Math.max(0, props.loggedToday ? props.streak - 1 : props.streak))
  const chain = Array.from({ length: 7 }, (_, i) => {
    const fromToday = 6 - i
    const today = fromToday === 0
    const on = today ? props.loggedToday : fromToday <= doneBefore
    return { today, on }
  })
  const dayLetters = chainLetters(props.todayDow)
  const pct = props.nextMilestone ? Math.min(100, Math.round((props.streak / props.nextMilestone.day) * 100)) : 100
  const chainDone = chain.filter((c) => c.on).length

  const zapMax = Math.max(1, ...props.zapRows.map((r) => r.zaps))

  return (
    <>
      <div className="fa-stats">
        {stats.map((s) => (
          <button key={s.k} type="button" className="fa-stat" aria-pressed={stat === s.k} onClick={() => setStat(s.k)}>
            {s.k === 'rank' ? (
              <span className="fa-rankpill">
                <span className="fq-iri-text on-light">{s.val}</span>
              </span>
            ) : (
              <span className="fa-stat-n">
                <span className="num">{typeof s.val === 'number' ? s.val.toLocaleString('en-US') : s.val}</span>
                {s.glyph && <i aria-hidden>{s.glyph}</i>}
              </span>
            )}
            <span className="fa-stat-l">{s.label}</span>
          </button>
        ))}
      </div>
      <div className="fa-glass">
        {stat === 'streak' && (
          <div className="fa-streak">
            <div className="fa-ring" style={{ '--p': `${pct}%` } as CSSProperties}>
              <span className="fq-breathe" aria-hidden />
              <span className="fa-ring-arc" aria-hidden />
              <span className="fa-ring-in">
                <b>{streak}</b>
                <i>{props.streak === 1 ? 'day' : 'days'}</i>
              </span>
            </div>
            <div className="fa-streak-r">
              <div className="fa-between">
                <span className="fa-h18">{props.streak > 0 ? 'Keep it going' : 'Start a streak'}</span>
                {props.nextMilestone && props.toNext > 0 && (
                  <span className="fa-m13">
                    {props.toNext} {props.toNext === 1 ? 'day' : 'days'} to your {props.nextMilestone.day}-day mark
                  </span>
                )}
              </div>
              <div className="fa-chain">
                <s style={{ width: `calc((100% - 32px) * ${Math.max(0, chainDone - 1)} / 6)` }} aria-hidden />
                {chain.map((d, i) => (
                  <span key={i} className={d.today ? (d.on ? 'fa-node on' : 'fa-node today') : d.on ? 'fa-node on' : 'fa-node'}>
                    <span className={d.today && !d.on ? 'fq-breathe' : undefined}>{d.on && <FqIcon name="checkin" />}</span>
                    {dayLetters[i]}
                  </span>
                ))}
              </div>
              <div className="row wrap">
                {props.freezeTokens > 0 && (
                  <span className="fa-freeze">
                    <FqIcon name="nudge" />
                    {props.freezeTokens} {props.freezeTokens === 1 ? 'freeze' : 'freezes'}
                  </span>
                )}
                <span className="meta grow" style={{ minWidth: 160 }}>
                  {props.loggedToday
                    ? 'Logged today. Come back tomorrow to keep it.'
                    : props.streak > 0
                      ? `Log one practice by midnight to make it ${props.streak + 1}.`
                      : 'Log one practice today to start.'}
                </span>
                <Link href={props.tuneOutHref} className="fa-tuneout">
                  <span className="fq-breathe" aria-hidden />
                  Tune out
                </Link>
              </div>
            </div>
          </div>
        )}
        {stat === 'zaps' && (
          <div className="stack" style={{ gap: 14 }}>
            {props.zapRows.length > 0 ? (
              props.zapRows.map((z) => (
                <div key={z.label} className="fa-zrow">
                  <span>{z.label}</span>
                  <span className="meter">
                    <i style={{ width: `${Math.round((z.zaps / zapMax) * 100)}%` }} />
                  </span>
                  <b>{z.zaps}</b>
                </div>
              ))
            ) : (
              <span className="meta">No Zaps this season yet.</span>
            )}
            <span className="meta">Only showing up earns Zaps.</span>
          </div>
        )}
        {stat === 'gems' && (
          <div className="row wrap" style={{ gap: 24 }}>
            <span className="grow" style={{ minWidth: 220, font: '400 var(--fq-text-body-s)/var(--fq-lh-body-s) var(--fq-font-sans)', color: 'var(--fq-text-body)' }}>
              Spend Gems in the Vault on a streak freeze, or gift some to a friend.
            </span>
            <Link href="/crew/store" className="btn">
              Open the Vault
            </Link>
          </div>
        )}
        {stat === 'rank' && (
          <div className="stack">
            <div className="fa-ranks">
              {props.ranks.map((r) => (
                <span key={r.label} className={r.reached ? 'on' : undefined}>
                  {r.label}
                </span>
              ))}
            </div>
            <span className="meta">
              {props.journeysFinished} {props.journeysFinished === 1 ? 'Journey' : 'Journeys'} finished this season.
              {props.nextRankLabel && props.journeysToNext != null
                ? ` Finish ${props.journeysToNext} more to reach ${props.nextRankLabel}.`
                : ' You’re at the top of the ladder.'}
            </span>
          </div>
        )}
      </div>
    </>
  )
}

/** The chain's day letters, oldest to today, in the member's own week. */
function chainLetters(today: number): string[] {
  const L = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  return Array.from({ length: 7 }, (_, i) => L[(today - (6 - i) + 7) % 7]!)
}
