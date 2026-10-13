import Link from 'next/link'
import { Suspense } from 'react'
import '@/app/themes/frequency/members-b.css'
import { getCircleMomentum } from '@/lib/connections/metrics'
import { loadCircleBoard, type CircleBoardMember } from '@/lib/circles/effort-board'
import { MIN_BOARD_CONTRIBUTORS } from '@/lib/quest/effort'
import { nextMilestone } from '@/components/quest/collective-goal'
import { EFFORT_BAND_CHIP } from '@/components/quest/leaderboard-list'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'
import { FqBoardHide } from './board-hide'

// CIRCLE STATS, IN THE KIT (the Circle's fourth tab; the reference's "This Circle" numbers panel
// grown into a page). The route (app/(main)/circles/[slug]/(circle)/stats/page.tsx) keeps every read
// and gate; this draws them in the kit's idiom, in the DAWN tab's order and with its rules:
//   1. MOMENTUM: four numbers, aggregate only (the same circle_momentum read).
//   2. THE SHARED TOTAL leads the board: one meter toward the next milestone, everyone adds to it.
//   3. THE BOARD, for members and managers only: Effort or Consistency, alphabetical, no positions,
//      and no list at all under MIN_BOARD_CONTRIBUTORS people in the same week.
//   4. YOUR WEEK when the list does not already carry the viewer, and the plain "how it works".

type Track = 'effort' | 'consistency'

async function Momentum({ circleId }: { circleId: string }) {
  const m = await getCircleMomentum(circleId).catch(() => null)
  if (!m) return null
  if (m.members === 0 && m.newMembers7d === 0 && m.newTies7d === 0 && m.upcomingEvents === 0) return null
  const warming = m.newMembers7d > 0 || m.newTies7d > 0
  const cells: [number, string][] = [
    [m.members, m.members === 1 ? 'Member' : 'Members'],
    [m.newMembers7d, 'New this week'],
    [m.newTies7d, 'New connections'],
    [m.upcomingEvents, 'Upcoming events'],
  ]
  return (
    <div className="panel stack">
      <div className="sec-h fqm-sec-h0">
        <span className="k">Momentum</span>
        <span className="meta">{warming ? 'Warming up this week.' : 'Quiet this week. A good time to gather.'}</span>
      </div>
      <div className="g4 fqm-stats">
        {cells.map(([n, label]) => (
          <div key={label}>
            <span className="num">{n.toLocaleString()}</span>
            <div className="t2">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function metric(m: CircleBoardMember, track: Track): string {
  if (track === 'consistency') return `${m.streak} ${m.streak === 1 ? 'day' : 'days'}`
  return m.effort.index == null
    ? `${m.effort.daysThisWeek} ${m.effort.daysThisWeek === 1 ? 'day this week' : 'days this week'}`
    : `${m.effort.index}% of usual`
}

function BoardRow({ m, track, me }: { m: CircleBoardMember; track: Track; me: boolean }) {
  return (
    <Link href={`/people/${m.handle}`}>
      <FqAvatar url={m.avatarUrl} name={m.displayName} />
      <span className="grow">
        <span className="t1 fqm-block">
          {m.displayName}
          {me ? ' · you' : ''}
        </span>
        <span className="t2">{EFFORT_BAND_CHIP[m.effort.band].label}</span>
      </span>
      <span className="t1">{metric(m, track)}</span>
    </Link>
  )
}

async function Board({
  circleId,
  memberIds,
  viewerId,
  track,
}: {
  circleId: string
  memberIds: string[]
  viewerId: string | null
  track: Track
}) {
  const board = await loadCircleBoard(circleId, memberIds, viewerId)
  const me = board.me
  const showMyWeek = !!me && !board.rows.some((r) => r.id === me.id)
  return (
    <>
      <div className="stack">
        <div className="sec-h fqm-sec-h0">
          <h2 className="h2">This week</h2>
          {board.showsBoard && <span className="meta">{board.rows.length} showing up</span>}
        </div>
        {board.showsBoard ? (
          <>
            <span className="t2">
              {track === 'effort'
                ? 'Everyone here is measured against their own last few weeks, not against each other. The list is alphabetical, so there is no first place.'
                : 'Everyone’s current daily practice streak. Same alphabetical list: this is what each person has going, not a race.'}
            </span>
            <div className="list">
              {board.rows.map((m) => (
                <BoardRow key={m.id} m={m} track={track} me={m.id === viewerId} />
              ))}
            </div>
          </>
        ) : (
          <p className="why">
            {board.showing === 0
              ? `Nobody has logged anything in the last 7 days. A board needs about ${MIN_BOARD_CONTRIBUTORS} people showing up in the same week before it says anything worth reading. The total above counts everyone either way.`
              : `${board.showing === 1 ? 'One person has' : `${board.showing} people have`} shown up this week. A board needs about ${MIN_BOARD_CONTRIBUTORS} in the same week before it says anything worth reading, so there is no list yet. The total above counts everyone either way.`}
          </p>
        )}
      </div>

      {me && showMyWeek && (
        <div className="stack">
          <h2 className="h2">Your week</h2>
          {me.effort.recent === 0 ? (
            <span className="t2">
              You have not logged anything in the last 7 days. Nothing is lost. Log one practice and your week starts
              counting again.
            </span>
          ) : (
            <div className="list">
              <BoardRow m={me} track={track} me />
            </div>
          )}
          {me.optedOut && (
            <span className="t2">You are hidden from this Circle’s list right now. You still count toward the shared total.</span>
          )}
        </div>
      )}

      {track === 'effort' && (
        <div className="soft stack fqm-gap-sm">
          <span className="h3">How the number works</span>
          <span className="t2">
            It is the Zaps you earned in the last 7 days, as a percent of your own usual week. Your usual week is the
            middle of your last four weeks that had any activity.
          </span>
          <span className="t2">
            You need two of those four weeks before there is a usual week to compare with. Until then your row shows the
            days you showed up.
          </span>
          <span className="t2">
            A gap never costs you anything. Come back after a quiet month and your row reads Back this week instead of a
            number.
          </span>
        </div>
      )}
    </>
  )
}

export function FqCircleStatsPane({
  circleId,
  slug,
  total,
  contributors,
  seasonName,
  canSeeRows,
  optedOut,
  track,
  memberIds,
  viewerId,
}: {
  circleId: string
  slug: string
  total: number
  contributors: number
  seasonName: string | null
  canSeeRows: boolean
  optedOut: boolean
  track: Track
  memberIds: string[]
  viewerId: string | null
}) {
  const { target, pct } = nextMilestone(total)
  const remaining = Math.max(0, target - total)
  const base = `/circles/${slug}/stats`
  return (
    <div className="stack fqm-secs">
      <Suspense fallback={null}>
        <Momentum circleId={circleId} />
      </Suspense>

      <div className="soft stack">
        <span className="k">{seasonName ? `The Quest · ${seasonName}` : 'The Quest'}</span>
        <h2 className="h2">
          Together with this <span className="serif">Circle.</span>
        </h2>
        <span className="t2">Every practice you log adds to the same total. This one belongs to the group.</span>
        <div className="row fqm-goal">
          <span className="num">{total.toLocaleString()}</span>
          <span className="t2 grow">of {target.toLocaleString()} Zaps</span>
          <span className="t1">{pct}%</span>
        </div>
        <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the next milestone">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="row wrap fqm-goal-foot">
          <span className="t2 grow">
            {contributors.toLocaleString()} {contributors === 1 ? 'person adding to it' : 'people adding to it'}
          </span>
          <span className="t2">
            {remaining > 0 ? `${remaining.toLocaleString()} Zaps to the next milestone` : 'Milestone reached. The next one is already open.'}
          </span>
        </div>
      </div>

      {!canSeeRows ? (
        <div className="panel stack fqm-gap-sm">
          <span className="h3">The board is for people in this Circle</span>
          <span className="t2">The total above is the whole Circle’s. Join, log a practice, and your own week shows up here.</span>
        </div>
      ) : (
        <>
          <div className="fqm-tabrow">
            <nav className="tabs" aria-label="Board">
              {(['effort', 'consistency'] as const).map((t) => (
                <Link key={t} href={`${base}?track=${t}`} className={t === track ? 'on' : undefined} aria-current={t === track ? 'page' : undefined}>
                  {t === 'effort' ? 'Effort' : 'Consistency'}
                </Link>
              ))}
            </nav>
            <div className="row">
              <FqBoardHide hidden={optedOut} basePath={base} />
            </div>
          </div>
          <Suspense key={track} fallback={<p className="t2">Loading the board</p>}>
            <Board circleId={circleId} memberIds={memberIds} viewerId={viewerId} track={track} />
          </Suspense>
        </>
      )}
    </div>
  )
}
