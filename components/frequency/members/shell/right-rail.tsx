// THE FREQUENCY RIGHT RAIL (README §3, Members.dc.html right rail). The DAWN rail
// (components/sidebar/right-sidebar.tsx) stays as it is; under SITE_DESIGN === 'frequency' the
// layout mounts this instead, which draws the design's panels first and then keeps every panel the
// platform already had, in the kit's idiom (owner's hybrid rule: design wins on layout and copy,
// real features the design lacks are kept and restyled, never dropped).
//
//   Get started      lib/onboarding/status.ts (replaces DAWN's "Your Quest" next-step card)
//   Your week        the member's own Going / waitlist RSVPs for the seven days from their today
//   Today's goals    adopted practices vs logged today, the Journey lesson or the streak, a plan
//   Your Circles     season Zaps among Circle-mates, cooperative, opt-out honoured
//   People to know   lib/people-suggestions.ts
//   ── the platform's own panels, restyled (.fqm-legacy) ──
//   demo notice · Your activity · the route's page panels (railFor) · Frequency Signature
//   Invite a friend · Report a bug
//
// SITE-WIDE, all five, on purpose. A layout does not re-render on client navigation, so a panel
// keyed to /feed would vanish for anyone who landed elsewhere first and stay for anyone who left the
// Feed: the rail would answer for the page the member first loaded, not the one they are on. The
// design's panels are about the member, not the page, so they ride on every route; the page panels
// below keep the DAWN rail's own route handling.
//
// Every panel is its own Suspense boundary with a null fallback, and a panel with nothing real to
// say renders nothing. No sample numbers, and no Zap rewards on goals or setup.

import Link from 'next/link'
import { Suspense } from 'react'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import type { DockData } from '@/components/sidebar/game-stats-dock'
import { DemoNotice } from '@/components/sidebar/demo-notice'
import { ActivityPanel, InvitePanel, PagePanels, SignaturePanel, type CommunityRole } from '@/components/sidebar/right-sidebar'
import { buildGoals, weekPlanCount } from '@/lib/feed/frequency-rail-core'
import { loadLocalBoard, loadPeopleToKnow, loadRailOnboarding, loadYourWeek } from '@/lib/feed/frequency-rail'
import { getInitials } from '@/lib/utils'
import { AddToggle } from '../shared/toggles'
import { avatarBg } from './avatar'
import { GetStarted } from './get-started'
import { ReportRow } from './report-row'

type Stats = Promise<DockData | null>

export interface FrequencyRightRailProps {
  profileId: string
  role: CommunityRole
  pathname: string
  stats: Stats
}

const n = (v: number) => v.toLocaleString('en-US')

function Face({ url, name, size }: { url: string | null; name: string; size: number }) {
  return (
    <span className="fqm-av" style={{ width: size, height: size, ...avatarBg(url) }} aria-hidden>
      {url ? null : getInitials(name)}
    </span>
  )
}

// ── Get started ─────────────────────────────────────────────────────────────────────────────────

async function GetStartedPanel({ profileId }: { profileId: string }) {
  const steps = await loadRailOnboarding(profileId)
  return steps ? <GetStarted steps={steps} /> : null
}

// ── Your week ───────────────────────────────────────────────────────────────────────────────────

async function YourWeekPanel({ profileId, stats }: { profileId: string; stats: Stats }) {
  const d = await stats
  const week = await loadYourWeek(profileId, d?.today ?? null)
  const count = weekPlanCount(week)
  return (
    <section className="fqm-rp" aria-label="Your week" data-visual-mask="rail-panel">
      <div className="fqm-rp-h">
        <b>Your week</b>
        <span>{count === 0 ? 'Nothing planned' : count === 1 ? '1 plan' : `${count} plans`}</span>
      </div>
      <div className="fqm-week">
        {week.map((day) => (
          <div key={day.date} className="fqm-day">
            <span className="fqm-day-d">
              <small>{day.dow}</small>
              <b>{day.d}</b>
            </span>
            <span className="fqm-day-items">
              {day.items.length === 0 ? (
                <i className="fqm-day-empty" aria-hidden />
              ) : (
                day.items.map((it) => (
                  <Link key={it.eventId} href={it.href}>
                    <i aria-hidden />
                    <span>{it.name}</span>
                    <small>{it.time}</small>
                  </Link>
                ))
              )}
            </span>
          </div>
        ))}
      </div>
      {count === 0 && (
        <Link href="/events" className="fqm-rp-more">
          Find something this week
        </Link>
      )}
    </section>
  )
}

// ── Today's goals ───────────────────────────────────────────────────────────────────────────────

async function GoalsPanel({ profileId, stats }: { profileId: string; stats: Stats }) {
  const d = await stats
  if (!d) return null
  const week = await loadYourWeek(profileId, d.today ?? null)
  const goals = buildGoals({
    adopted: d.practices?.adopted ?? 0,
    toLog: d.practices?.toLog ?? 0,
    streak: d.streak,
    lesson: d.arc ? { step: d.arc.step, pct: d.arc.pct } : null,
    plans: weekPlanCount(week),
  })
  const done = goals.filter((g) => g.done).length
  return (
    <section className="fqm-rp" aria-label="Today’s goals" data-visual-mask="rail-panel">
      <div className="fqm-rp-h">
        <b>Today’s goals</b>
        <span>
          {done} of {goals.length}
        </span>
      </div>
      {goals.map((g) => (
        <Link key={g.key} href={g.href} className={g.done ? 'fqm-goal done' : 'fqm-goal'}>
          <span className="fqm-goal-t">
            <span>{g.title}</span>
            {g.done ? <FqIcon name="checkin" /> : g.progress ? <small>{g.progress}</small> : null}
          </span>
          <span className="fqm-bar">
            <i style={{ width: `${g.pct}%` }} />
          </span>
        </Link>
      ))}
    </section>
  )
}

// ── The local board ─────────────────────────────────────────────────────────────────────────────

async function BoardPanel({ profileId }: { profileId: string }) {
  const board = await loadLocalBoard(profileId)
  if (!board) return null
  const pct = Math.round((board.contributors / board.members) * 100)
  return (
    <section className="fqm-rp" aria-label="Your Circles this season" data-visual-mask="rail-panel">
      <div className="fqm-rp-h">
        <b>Your Circles this season</b>
        <span>
          {n(board.contributors)} of {n(board.members)}
        </span>
      </div>
      <span className="fqm-bar iri" role="img" aria-label={`${board.contributors} of ${board.members} people in your Circles have earned Zaps this season`}>
        <i style={{ width: `${pct}%` }} />
      </span>
      <div className="fqm-board">
        {board.top.map((e) => (
          <div key={e.id} className={e.me ? 'me' : undefined}>
            <span className="fqm-board-n">{e.n}</span>
            <Face url={e.avatarUrl} name={e.name} size={30} />
            <span className="fqm-grow">{e.me ? 'You' : e.name}</span>
            <small>⚡ {n(e.zaps)}</small>
          </div>
        ))}
      </div>
      <Link href="/crew/leaderboard" className="fqm-rp-foot">
        Local and cooperative. Opt out on the board.
      </Link>
    </section>
  )
}

// ── People to know ──────────────────────────────────────────────────────────────────────────────

async function PeoplePanel({ profileId }: { profileId: string }) {
  const people = await loadPeopleToKnow(profileId)
  if (people.length === 0) return null
  return (
    <section className="fqm-rp" aria-label="People to know" data-visual-mask="rail-panel">
      <div className="fqm-rp-h">
        <b>People to know</b>
      </div>
      {people.map((p) => (
        <div key={p.id} className="fqm-person">
          <Link href={`/people/${p.handle}`} aria-label={p.name}>
            <Face url={p.avatarUrl} name={p.name} size={40} />
          </Link>
          <span className="fqm-grow">
            <Link href={`/people/${p.handle}`}>{p.name}</Link>
            <small>{p.why}</small>
          </span>
          <AddToggle profileId={p.id} name={p.name} initial="none" />
        </div>
      ))}
    </section>
  )
}

// ── The open rail ───────────────────────────────────────────────────────────────────────────────

export function FrequencyRightRail({ profileId, role, pathname, stats }: FrequencyRightRailProps) {
  return (
    <div className="fqm-r-stack">
      <Suspense fallback={null}>
        <DemoNotice />
      </Suspense>
      <Suspense fallback={null}>
        <GetStartedPanel profileId={profileId} />
      </Suspense>
      <Suspense fallback={null}>
        <YourWeekPanel profileId={profileId} stats={stats} />
      </Suspense>
      <Suspense fallback={null}>
        <GoalsPanel profileId={profileId} stats={stats} />
      </Suspense>
      <Suspense fallback={null}>
        <BoardPanel profileId={profileId} />
      </Suspense>
      <Suspense fallback={null}>
        <PeoplePanel profileId={profileId} />
      </Suspense>
      {/* The platform's own panels, kept and restyled (.fqm-legacy in members-shell.css). The page
          panels keep the DAWN rail's one stable boundary (see the note in PagePanels). */}
      <div className="fqm-legacy">
        {pathname !== '/practices' && (
          <Suspense fallback={null}>
            <ActivityPanel profileId={profileId} />
          </Suspense>
        )}
        <Suspense fallback={null}>
          <PagePanels profileId={profileId} role={role} pathname={pathname} />
        </Suspense>
        {!pathname.startsWith('/people/') && (
          <Suspense fallback={null}>
            <SignaturePanel profileId={profileId} />
          </Suspense>
        )}
      </div>
      <div className="fqm-utils">
        <Suspense fallback={null}>
          <InvitePanel profileId={profileId} />
        </Suspense>
        <ReportRow />
      </div>
    </div>
  )
}

// ── The micro rail (76px): one button per panel, a value under each icon ──────────────────────

function MicroItem({ icon, value, tip, sub }: { icon: FqIconName; value: string; tip: string; sub: string }) {
  return (
    <button type="button" className="fqm-rmi" data-fqm-expand="" aria-label={`${tip}, ${sub}. Open the rail`} data-tip={tip} data-tip-sub={sub}>
      <FqIcon name={icon} />
      {value}
    </button>
  )
}

async function MicroGetStarted({ profileId }: { profileId: string }) {
  const steps = await loadRailOnboarding(profileId)
  if (!steps) return null
  const done = steps.filter((s) => s.done).length
  const left = steps.length - done
  return <MicroItem icon="compass" value={`${done}/${steps.length}`} tip="Get started" sub={`${left} left`} />
}

async function MicroWeek({ profileId, stats }: { profileId: string; stats: Stats }) {
  const d = await stats
  const count = weekPlanCount(await loadYourWeek(profileId, d?.today ?? null))
  return <MicroItem icon="event" value={String(count)} tip="Your week" sub={count === 1 ? '1 plan' : `${count} plans`} />
}

async function MicroGoals({ profileId, stats }: { profileId: string; stats: Stats }) {
  const d = await stats
  if (!d) return null
  const week = await loadYourWeek(profileId, d.today ?? null)
  const goals = buildGoals({
    adopted: d.practices?.adopted ?? 0,
    toLog: d.practices?.toLog ?? 0,
    streak: d.streak,
    lesson: d.arc ? { step: d.arc.step, pct: d.arc.pct } : null,
    plans: weekPlanCount(week),
  })
  const done = goals.filter((g) => g.done).length
  return <MicroItem icon="goal" value={`${done}/${goals.length}`} tip="Today’s goals" sub={`${done} of ${goals.length} done`} />
}

async function MicroBoard({ profileId }: { profileId: string }) {
  const board = await loadLocalBoard(profileId)
  const me = board?.top.find((e) => e.me)
  if (!board || !me) return null
  return <MicroItem icon="podium" value={`#${me.n}`} tip="Your Circles this season" sub={`⚡ ${n(me.zaps)}`} />
}

async function MicroPeople({ profileId }: { profileId: string }) {
  const people = await loadPeopleToKnow(profileId)
  if (people.length === 0) return null
  return <MicroItem icon="contacts" value={String(people.length)} tip="People to know" sub={people.map((p) => p.name).join(', ')} />
}

export function FrequencyRightMicro({ profileId, stats }: Pick<FrequencyRightRailProps, 'profileId' | 'stats'>) {
  return (
    <>
      <Suspense fallback={null}>
        <MicroGetStarted profileId={profileId} />
      </Suspense>
      <Suspense fallback={null}>
        <MicroWeek profileId={profileId} stats={stats} />
      </Suspense>
      <Suspense fallback={null}>
        <MicroGoals profileId={profileId} stats={stats} />
      </Suspense>
      <Suspense fallback={null}>
        <MicroBoard profileId={profileId} />
      </Suspense>
      <Suspense fallback={null}>
        <MicroPeople profileId={profileId} />
      </Suspense>
    </>
  )
}
