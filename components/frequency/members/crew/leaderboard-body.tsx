import Link from 'next/link'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'
import { BoardVisibilitySwitch } from '@/components/frequency/members/shared/board-visibility'
import { nextMilestone } from '@/components/quest/collective-goal'
import { getRankDef } from '@/lib/season-ranks'
import type { LeaderboardListEntry } from '@/components/quest/leaderboard-list'

// THE LEADERBOARD under Frequency, in the members kit. The reference has no leaderboard screen; the
// right rail's "Bird Rock this week" panel (an iridescent meter, a short local board with You in bold,
// "Local and cooperative. Opt out in Settings.") is its idiom, and the DAWN page's cooperative order
// is kept exactly: the shared goal first, your own standing, then where people stand, scoped to your
// Circle by default and yours to leave. The page (app/(main)/crew/leaderboard/page.tsx) keeps every
// read; this body only places them.

type Scope = 'circle' | 'hub' | 'global'
type Track = 'zaps' | 'consistency'

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'circle', label: 'Circle' },
  { key: 'hub', label: 'Hub' },
  { key: 'global', label: 'Season' },
]

export function LeaderboardBody({
  scope,
  track,
  scopePhrase,
  seasonName,
  collective,
  me,
  hidden,
  board,
  after,
}: {
  scope: Scope
  track: Track
  scopePhrase: string
  seasonName: string | null
  collective: { total: number; contributors: number }
  me: { zaps: number; gems: number; streak: number; rankLabel: string; finished: number }
  hidden: boolean
  /** The individual board, streamed behind its own Suspense. */
  board: React.ReactNode
  /** The consistency layer (the route's layout module), when the operator shows it. */
  after: React.ReactNode
}) {
  const { target, pct } = nextMilestone(collective.total)
  const remaining = Math.max(0, target - collective.total)
  const href = (s: Scope, t: Track) => `/crew/leaderboard?scope=${s}&track=${t}`

  return (
    <MembersBody>
      <div className="head">
        <div>
          <span className="k">The Quest · Leaderboard</span>
          <h1 className="h1">
            Showing up, <span className="serif">together.</span>
          </h1>
          <span className="meta">One shared goal first. Where people stand sits below it, scoped to your Circle, and yours to opt out of.</span>
        </div>
        <div className="row wrap">
          <Link className="btn sm" href="/crew">
            My Quest
          </Link>
          <Link className="btn sm" href="/crew/store">
            The Vault
          </Link>
        </div>
      </div>

      <section className="panel mc-hero" aria-label="The shared goal">
        <div className="fq-aura" aria-hidden />
        <div className="stack grow mc-gap-10">
          <span className="k">{seasonName ? `The Quest · ${seasonName}` : 'The Quest'}</span>
          <span className="h2">Together with {scopePhrase}</span>
          <span className="why">Every practice you log adds to the same total. This one belongs to the group.</span>
          <div className="row">
            <span className="num grow">⚡ {collective.total.toLocaleString()}</span>
            <span className="t2">of {target.toLocaleString()}</span>
          </div>
          <div className="meter iri" role="img" aria-label={`${pct}% of the way to ${target.toLocaleString()} Zaps`}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <span className="t2">
            {collective.contributors.toLocaleString()} {collective.contributors === 1 ? 'person' : 'people'} pitching in ·{' '}
            {remaining.toLocaleString()} to the next milestone
          </span>
        </div>
      </section>

      <div className="g4 sec">
        <Link className="stack mc-gap-8" href="/crew/store">
          <span className="num">⚡ {me.zaps.toLocaleString()}</span>
          <span className="t2">Zaps this season</span>
        </Link>
        <Link className="stack mc-gap-8" href="/crew/store">
          <span className="num">💎 {me.gems.toLocaleString()}</span>
          <span className="t2">Gems</span>
        </Link>
        <div className="stack mc-gap-8">
          <span className="num">{me.streak}</span>
          <span className="t2">Day streak</span>
        </div>
        <Link className="stack mc-gap-8" href="/crew">
          <span className="tag glass mc-tag-lg">{me.rankLabel}</span>
          <span className="t2">
            Season rank · {me.finished} of 3 Journeys
          </span>
        </Link>
      </div>

      <div className="ap-cols sec">
        <div>
          <div className="sec-h">
            <span className="h2">Where people stand</span>
            <span className="meta">
              {track === 'consistency'
                ? 'By daily practice streak'
                : `Season Zaps within ${scopePhrase}`}
            </span>
          </div>
          <div className="row wrap mc-between mc-bottom-12">
            <div className="chips" role="group" aria-label="Whose board">
              {SCOPES.map((s) => (
                <Link key={s.key} className={s.key === scope ? 'chip on' : 'chip'} href={href(s.key, track)} aria-current={s.key === scope ? 'page' : undefined}>
                  {s.label}
                </Link>
              ))}
            </div>
            <nav className="tabs" aria-label="Ranked by">
              <Link className={track === 'zaps' ? 'on' : undefined} href={href(scope, 'zaps')}>
                Zaps
              </Link>
              <Link className={track === 'consistency' ? 'on' : undefined} href={href(scope, 'consistency')}>
                Consistency
              </Link>
            </nav>
          </div>
          {board}
          {hidden && <p className="t2 mc-top-12">You are hidden from this board right now. You still count toward the shared goal above.</p>}
          {after && <div className="sec mc-stack-dawn">{after}</div>}
        </div>
        <aside className="side">
          <div className="panel stack">
            <div className="row">
              <span className="grow">
                <span className="t1 mc-block">Show me on leaderboards</span>
                <span className="t2">Hidden members still count toward the shared goal.</span>
              </span>
              <BoardVisibilitySwitch hidden={hidden} />
            </div>
          </div>
          <div className="soft stack mc-start">
            <span className="k">How it works</span>
            <span className="t2">
              Local and cooperative. Your Circle by default, ranked by Zaps or by the streak, so the steady person can lead on showing up.
            </span>
          </div>
        </aside>
      </div>
    </MembersBody>
  )
}

/** The individual rows: place, face, name (You in bold), rank, and the track's number. */
export function BoardList({
  entries,
  track,
  selfId,
  scope,
}: {
  entries: LeaderboardListEntry[]
  track: Track
  selfId: string
  scope: Scope
}) {
  if (entries.length === 0) {
    return (
      <div className="empty">
        <p className="why">
          {scope === 'circle'
            ? 'No one to show yet. Join a Circle and log a practice, and the board fills in here.'
            : 'No one to show yet. Once people start logging practices, they show up here.'}
        </p>
      </div>
    )
  }
  return (
    <ol className="list mc-plain">
      {entries.map((e, i) => {
        const self = e.id === selfId
        return (
          <li key={e.id}>
            <Link className="row grow" href={`/people/${e.handle}`}>
              <span className="t2 mc-place">{i + 1}</span>
              <FqAvatar url={e.avatarUrl} name={e.displayName} />
              <span className="grow">
                <span className={self ? 't1 mc-block' : 't1 mc-block mc-normal'}>{self ? `${e.displayName} · you` : e.displayName}</span>
                <span className="t2">{getRankDef(e.seasonRank).label}</span>
              </span>
              <span className="t1">
                {track === 'consistency' ? `${e.streak} ${e.streak === 1 ? 'day' : 'days'}` : `⚡ ${e.seasonZaps.toLocaleString()}`}
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
