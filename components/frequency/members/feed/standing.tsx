'use client'

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react'
import Link from 'next/link'
import { AdoptedPracticeStart } from '@/components/practice/adopted-practice-start'
import { FqIcon } from '@/components/frequency/icon'
import type { PracticeWeekDay } from '@/lib/feed/practice-week'
import type { ZapRow } from '@/lib/feed/frequency-home'

// STANDING: four tappable numbers (streak, Zaps this season, Gems, season rank) over one glass
// panel that swaps by stat. The numbers count up over 1100ms (ease-out cubic) unless the member
// asked for reduced motion. Every value is the member's own: lib/member-progress.ts and the
// practice-streak state, the Zap ledger for the breakdown, the rank ladder in lib/season-ranks.ts.
//
// The 2026-10-14 export adds two things, both kept: the panel folds away under a round chevron (the
// member's choice persists in `fq-streak-box`, '0' = folded; the folded face is a small ring, the
// streak line and the next practice to start), and the streak panel lists the member's adopted
// practices, each a door to its own page where the real timer runs (the prototype's in-feed countdown
// would be a second timer beside On Air's, so it is not copied). With nothing adopted, the old line
// and Tune out stay.

export interface StandingPractice {
  id: string
  title: string
  href: string
  /** "10 min · daily", from the practice's own length and cadence; '' when it has neither. */
  meta: string
  done: boolean
}

const BOX_KEY = 'fq-streak-box-v2' // v2 (2026-10-13): the box leads the Feed and opens expanded
const boxSubs = new Set<() => void>()
function readBox(): boolean {
  try {
    return localStorage.getItem(BOX_KEY) !== '0'
  } catch {
    return true
  }
}
function subscribeBox(f: () => void) {
  boxSubs.add(f)
  return () => {
    boxSubs.delete(f)
  }
}
function setBox(open: boolean) {
  try {
    localStorage.setItem(BOX_KEY, open ? '1' : '0')
  } catch {
    /* not persisted; the fold still holds until the next render from storage */
  }
  boxSubs.forEach((f) => f())
}

type Stat = 'streak' | 'zaps' | 'gems' | 'rank'

interface StandingProps {
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
  /** Real session minutes and untimed logs, Monday–Sunday in the member's timezone. */
  practiceWeek?: PracticeWeekDay[] | null
  /** The member's adopted practices, with whether each is logged on their today. */
  practices: StandingPractice[]
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

export function Standing(props: StandingProps & { afterStats?: React.ReactNode }) {
  const [stat, setStat] = useState<Stat>('streak')
  const boxOpen = useSyncExternalStore(subscribeBox, readBox, () => true)
  const streak = useCountUp(props.streak)
  const zaps = useCountUp(props.zaps)
  const gems = useCountUp(props.gems)

  const stats: { k: Stat; label: string; val: number | string; glyph: string }[] = [
    { k: 'streak', label: 'Day streak', val: streak, glyph: '' },
    { k: 'zaps', label: 'Zaps this season', val: zaps, glyph: '⚡' },
    { k: 'gems', label: 'Gems to spend', val: gems, glyph: '💎' },
    { k: 'rank', label: 'Season rank', val: props.rankLabel, glyph: '' },
  ]

  const pct = props.nextMilestone ? Math.min(100, Math.round((props.streak / props.nextMilestone.day) * 100)) : 100

  const zapMax = Math.max(1, ...props.zapRows.map((r) => r.zaps))
  const doneN = props.practices.filter((p) => p.done).length
  const next = props.practices.find((p) => !p.done) ?? null
  const hint = props.loggedToday
    ? props.practices.length > 0
      ? `Streak safe today. ${doneN} of ${props.practices.length} done.`
      : 'Logged today. Come back tomorrow to keep it.'
    : props.streak > 0
      ? `Start one by midnight to make it ${props.streak + 1}.`
      : 'Log one practice today to start.'

  return (
    <>
      <div className="fa-stats-composition"><div className="fa-stats">
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
      {props.afterStats}</div>
      <div className="fa-glass fa-standing-panel" data-open={boxOpen ? '' : undefined}>
        <button
          type="button"
          className="fa-fold"
          aria-expanded={boxOpen}
          aria-controls="fa-standing-body"
          aria-label={boxOpen ? 'Fold your standing away' : 'Open your standing'}
          title={boxOpen ? 'Collapse' : 'Expand'}
          onClick={() => setBox(!boxOpen)}
        >
          <FqIcon name="chevron" />
        </button>
        {!boxOpen && (
          <div className="fa-folded">
            <span className="fa-mini-ring" style={{ '--p': `${pct}%` } as CSSProperties} aria-hidden>
              <span>{props.streak}</span>
            </span>
            <span className="fa-folded-t">
              <b>{props.streak > 0 ? 'Keep it going' : 'Start a streak'}</b>
              <small>{hint}</small>
            </span>
            {next && (
              <AdoptedPracticeStart practiceId={next.id} title={next.title} className="fa-tuneout">
                <span className="fq-breathe" aria-hidden />
                Start {next.title}
              </AdoptedPracticeStart>
            )}
          </div>
        )}
        <div className="fa-fold-body" id="fa-standing-body" inert={!boxOpen}>
        <div>
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
                <span className="fa-streak-support">{props.loggedToday ? 'You showed up today.' : 'One practice keeps it going.'}</span>
              </div>
              <PracticeWeek days={props.practiceWeek ?? null} />
              {props.practices.length > 0 ? (
                <div className="fa-practices" data-visual-mask="feed-practices">
                  <div className="fa-between">
                    <span className="k">Your practices</span>
                    <span className="fa-practice-count">{doneN}/{props.practices.length} today</span>
                  </div>
                  <div className="fa-pgrid">
                    {props.practices.map((p) => (
                      <AdoptedPracticeStart key={p.id} practiceId={p.id} title={p.title} className={p.done ? 'fa-pchip done' : 'fa-pchip'}>
                        <span className="fa-pchip-ic" aria-hidden>
                          <FqIcon name={p.done ? 'check' : 'practice'} />
                        </span>
                        <span className="fa-pchip-t">
                          <b>{p.title}</b>
                          <small>{p.meta.split(' · ').find((part) => /\d.*min/.test(part)) || 'Start'}</small>
                        </span>
                      </AdoptedPracticeStart>
                    ))}
                    <Link href="/practices#practices-mine" className="fa-pchip fa-practice-more"><span>{props.practices.length > 5 ? `Show all ${props.practices.length}` : '+ Adopt'}</span></Link>
                  </div>
                  <div className="row wrap">
                    {props.freezeTokens > 0 && (
                      <span className="fa-freeze">
                        <FqIcon name="nudge" />
                        {props.freezeTokens} {props.freezeTokens === 1 ? 'freeze' : 'freezes'}
                      </span>
                    )}
                    <Link href="/practices" className="fa-link fa-practice-adopt-desktop">Adopt another practice</Link>
                  </div>
                </div>
              ) : (
                <div className="row wrap">
                  {props.freezeTokens > 0 && (
                    <span className="fa-freeze">
                      <FqIcon name="nudge" />
                      {props.freezeTokens} {props.freezeTokens === 1 ? 'freeze' : 'freezes'}
                    </span>
                  )}
                  <span className="meta grow" style={{ minWidth: 160 }}>
                    {hint}
                  </span>
                  <Link href={props.tuneOutHref} className="fa-tuneout">
                    <span className="fq-breathe" aria-hidden />
                    Tune out
                  </Link>
                </div>
              )}
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
        </div>
      </div>
    </>
  )
}

function PracticeWeek({ days }: { days: PracticeWeekDay[] | null }) {
  if (!days) return <p className="fa-week-unavailable">Practice activity is unavailable right now.</p>
  const max = Math.max(1, ...days.map((d) => d.minutes))
  const total = Math.round(days.reduce((n, d) => n + d.minutes, 0) * 10) / 10
  const untimed = days.reduce((n, d) => n + d.untimed, 0)
  return <figure className="fa-week" aria-label="Monday to Sunday practice activity. Session minutes are attributed to the local finish day. Dots mark untimed completions.">
    <figcaption><b>This week</b><span>{total} min{untimed ? ` · ${untimed} untimed` : ''}</span></figcaption>
    <ol className="fa-week-bars">{days.map((d) => <li key={d.date} data-today={d.today || undefined} data-empty={d.minutes === 0 || undefined} data-future={d.future || undefined} aria-label={`${d.label} ${d.date}: ${d.future ? 'upcoming' : `${d.minutes} minutes finished, ${d.untimed} untimed completions`}${d.today ? ', today' : ''}`}>
      <span className="fa-week-value" aria-hidden>{d.future ? '–' : d.minutes || '0'}</span>
      <span className="fa-week-track" aria-hidden><i style={{ height: `${d.minutes / max * 100}%` }} />{d.untimed > 0 && <s title={`${d.untimed} untimed`} />}</span>
      <span aria-hidden>{d.label}</span>
    </li>)}</ol>
    <p title="Session minutes are attributed to the local finish day. Dots mark untimed completions.">Minutes by day</p>
  </figure>
}
