// STATS AND STREAKS: the member's standing at the top of the Frequency right rail (owner, 2026-10-14:
// "Create a stats / streaks box that rides up top"). A Server Component, no client JS.
//
// Every number is the member's own and comes from reads the shell already makes:
//   streak, today's state, the seven-day strip   DockData.streak + DockData.last7 (loadGameStats)
//   Zaps this season, Gems to spend, rank        DockData.zaps / vaultGems / rank / rankProgress
//   practices logged today vs adopted            DockData.practices
//   the eight-week sparkline                     loadRailActivity (the read behind DAWN's "Your
//                                                activity" chart, which this replaces in this rail)
// A reading with nothing behind it is left out (no Zaps yet, nothing adopted, no activity), never
// drawn as a zero that looks like a score.
//
// From the DAWN sidebar it takes the activity chart's weekly series as a compact bar run; the full
// Days / Weeks / Months chart stays on /practices, where the sparkline links. The Frequency
// Signature dial keeps its own panel below.

import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import type { DockData } from '@/components/sidebar/game-stats-dock'
import { activitySpark, streakReading } from '@/lib/feed/frequency-rail-core'
import { loadRailActivity } from '@/lib/feed/frequency-rail'
import { RANK_LABELS } from '@/lib/season-ranks'

const n = (v: number) => v.toLocaleString('en-US')
const DOW_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export async function RailStats({ profileId, stats, withActivity }: { profileId: string; stats: Promise<DockData | null>; withActivity: boolean }) {
  const [d, activity] = await Promise.all([stats, withActivity ? loadRailActivity(profileId) : Promise.resolve(null)])
  if (!d) return null

  const { loggedToday, line } = streakReading(d.streak, d.last7)
  const adopted = d.practices?.adopted ?? 0
  const logged = Math.max(0, adopted - (d.practices?.toLog ?? 0))
  const rank = d.rank ? RANK_LABELS[d.rank] : null
  const spark = activity ? activitySpark(activity.weeks, 8) : null
  const todayDow = d.today ? new Date(`${d.today}T12:00:00Z`).getUTCDay() : null
  const season = d.season ? `${d.season.name} · week ${d.season.week}${d.season.weeks ? ` of ${d.season.weeks}` : ''}` : null

  const tiles: { key: string; href: string; value: string; label: string; icon?: 'zap' | 'gem' | 'standing' | 'practice' }[] = []
  if (d.zaps > 0) tiles.push({ key: 'zaps', href: '/crew', value: n(d.zaps), label: 'Zaps this season', icon: 'zap' })
  if (d.vaultGems > 0) tiles.push({ key: 'gems', href: '/crew/store', value: n(d.vaultGems), label: 'Gems to spend', icon: 'gem' })
  if (rank) tiles.push({ key: 'rank', href: '/crew/leaderboard', value: rank, label: 'Season rank', icon: 'standing' })
  if (adopted > 0) tiles.push({ key: 'practices', href: '/practices', value: `${logged}/${adopted}`, label: 'Practices today', icon: 'practice' })

  return (
    <section className="fqm-rp fqm-stats" aria-label="Stats and streaks" data-visual-mask="rail-panel">
      <div className="fqm-rp-h">
        <b>Stats and streaks</b>
        {season && <span>{season}</span>}
      </div>

      <Link href="/practices" className="fqm-stats-streak">
        <span className="fqm-stats-num">
          <FqIcon name="streak" />
          <b>{n(d.streak)}</b>
          <small>day streak</small>
        </span>
        <span className={loggedToday ? 'tag live' : 'tag'}>{loggedToday ? 'Logged today' : 'Not yet today'}</span>
      </Link>
      <p className="fqm-stats-line">{line}</p>

      {d.last7.length > 0 && (
        <div className="fqm-vault-week" role="img" aria-label={`Last seven days: ${d.last7.filter((s) => s === 'done').length} logged`}>
          {d.last7.map((s, i) => {
            const today = i === d.last7.length - 1
            const state = s === 'done' ? 'on' : s === 'frozen' ? 'frozen' : today ? 'today' : 'off'
            const dow = todayDow == null ? null : (todayDow - (d.last7.length - 1 - i) + 7) % 7
            return (
              <span key={i} data-s={state}>
                <i aria-hidden />
                {dow == null ? null : DOW_LETTER[dow]}
              </span>
            )
          })}
        </div>
      )}

      {tiles.length > 0 && (
        <div className="fqm-stats-grid">
          {tiles.map((t) => (
            <Link key={t.key} href={t.href} className="fqm-stats-tile">
              <b>
                {t.icon && <FqIcon name={t.icon} />}
                {t.value}
              </b>
              <small>{t.label}</small>
            </Link>
          ))}
        </div>
      )}

      {d.rankProgress.nextLabel && d.rankProgress.toGo > 0 && (
        <div className="fqm-stats-rank">
          <span className="fqm-goal-t">
            <span>Next rank</span>
            <small>
              {d.rankProgress.toGo} {d.rankProgress.toGo === 1 ? 'Journey' : 'Journeys'} to {d.rankProgress.nextLabel}
            </small>
          </span>
          <span className="fqm-bar iri">
            <i style={{ width: `${Math.max(0, Math.min(100, d.rankProgress.pct))}%` }} />
          </span>
        </div>
      )}

      {spark && (
        <Link
          href="/practices"
          className="fqm-stats-spark"
          aria-label={`Practice activity: active ${spark.activeCount} of the last ${spark.bars.length} weeks. Open your practices`}
        >
          <span className="fqm-goal-t">
            <span>Last {spark.bars.length} weeks</span>
            <small>{spark.latestMinutes > 0 ? `${n(spark.latestMinutes)} min this week` : `Active ${spark.activeCount} of ${spark.bars.length}`}</small>
          </span>
          <span className="fqm-spark" aria-hidden>
            {spark.bars.map((b) => (
              <i key={b.key} data-on={b.active ? '' : undefined} style={{ height: `${b.h}%` }} />
            ))}
          </span>
        </Link>
      )}

      <div className="fqm-stats-foot">
        <Link href="/crew">The Quest</Link>
        <Link href="/crew/store">The Vault</Link>
      </div>
    </section>
  )
}
