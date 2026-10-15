import { Suspense } from 'react'
import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { MembersBody, SerifTail } from '@/components/frequency/members/shared/members-body'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'
import { visibleModuleOrder } from '@/components/frequency/members/shared/module-order'
import { HubLinks } from '@/components/frequency/members/shared/hub-links'
import { hubLinks } from '@/components/frequency/members/shell/nav'
import { QuestFinishCelebration } from '@/components/widgets/quest/quest-finish-celebration'
import { createAdminClient } from '@/lib/supabase/admin'
import { HOME_TZ } from '@/lib/time/zone'
import type { CrewContext } from '@/lib/quest/crew-context'
import { readSeasonMap, readPillarProgress, weeksLeft, seasonStartState, type JourneyArc } from '@/lib/quest/season-map-data'
import { getMemberJourneyProgress } from '@/lib/journeys/progress'
import { getMemberPractices, getPracticesToLogToday } from '@/lib/practices'
import { getNextGathering } from '@/lib/quest/next-gathering'
import { getRankDef, type SeasonRank } from '@/lib/season-ranks'
import { isOptedOut } from '@/app/(main)/crew/leaderboard/opt-out'

// MY QUEST (/crew) under Frequency, in the members kit. The reference has no Quest dashboard (the
// header's "The Quest" area opens Journey and Mindless), and the menu points here, so this is the kit's
// idiom over what /crew already shows under DAWN. Each section is one of the route's layout modules,
// read off the same loaders those modules use, so an operator's order and hidden blocks from Settings
// -> Page -> Layout still apply (visibleModuleOrder). Two columns: the act-now blocks on the left, the
// glanceable ones (next gathering, the Circle's board, Explore) in the side, each in the operator's order.
//
// Every figure is read. The Circle board honours each member's "hide me from the board" choice.

const SIDE = new Set(['quest-next-gathering', 'quest-leaderboard', 'quest-explore'])

const ARC_ICON: Record<JourneyArc['pillar'], FqIconName> = { Mind: 'breath', Body: 'practice', Spirit: 'moon' }

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: HOME_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

async function SeasonArcs({ ctx }: { ctx: CrewContext }) {
  const [map, pillars] = await Promise.all([readSeasonMap(ctx.profileId, ctx.season), readPillarProgress(ctx.profileId, ctx.season)])
  const start = seasonStartState(ctx.season)
  if (map.journeys.length === 0) {
    return (
      <div className="soft stack mc-start">
        <span className="k">{ctx.season ? ctx.season.name : 'The Quest'}</span>
        <span className="h3">{ctx.season ? `The Quest is open: ${ctx.season.name}` : 'The Quest opens soon'}</span>
        <span className="t2">
          This Quest&apos;s three Journeys appear here once the season&apos;s curriculum is live. Each covers all four Pillars: Mind,
          Body, Spirit, and Expression. Your daily practice still counts.
        </span>
      </div>
    )
  }
  return (
    <div className="stack">
      {start.notStarted && start.startLabel && <span className="t2">The season starts {start.startLabel}. Days count from then.</span>}
      <div className="g3">
        {map.journeys.map((j) => {
          const pct = j.state === 'done' ? 100 : Math.round((Math.min(j.daysLogged, j.daysNeeded) / Math.max(1, j.daysNeeded)) * 100)
          return (
            <Link key={j.journeyId} href={`/journeys/${j.slug}`} className={j.state === 'upcoming' ? 'panel stack mc-dim' : 'panel stack'}>
              <div className="row">
                <span className={j.state === 'done' ? 'ic mc-done' : j.state === 'current' ? 'ic mc-now' : 'ic'}>
                  <FqIcon name={j.state === 'done' ? 'check' : ARC_ICON[j.pillar]} />
                </span>
                <span className="k grow">{j.pillar}</span>
              </div>
              <span className="h3">{j.title}</span>
              <div className="meter" role="img" aria-label={`${pct}% of the days needed`}>
                <i style={{ width: `${pct}%` }} />
              </div>
              <span className="t2">
                {j.state === 'done'
                  ? 'Finished'
                  : j.state === 'current'
                    ? `${j.daysLogged} of ${j.daysNeeded} days${j.expression === 'done' ? ' · Expression done' : ''}`
                    : 'Opens later this season'}
              </span>
            </Link>
          )
        })}
      </div>
      <div className="g4">
        {pillars.map((p) => {
          const pct = Math.round((Math.min(p.daysLogged, p.daysTarget) / Math.max(1, p.daysTarget)) * 100)
          return (
            <div key={p.slug} className="stack mc-gap-6">
              <div className="row">
                <span className="t2 grow">{p.name}</span>
                <span className="t2">
                  {p.daysLogged}/{p.daysTarget}
                </span>
              </div>
              <div className="meter iri" aria-hidden>
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

async function Today({ ctx, withCta }: { ctx: CrewContext; withCta: boolean }) {
  const [map, toLog] = await Promise.all([
    readSeasonMap(ctx.profileId, ctx.season),
    withCta ? getPracticesToLogToday(ctx.profileId) : Promise.resolve([]),
  ])
  const current = map.current
  const expressionNext = !!current && map.currentExpressionPending
  const step = current
    ? expressionNext
      ? {
          k: 'Today',
          title: `Complete the ${current.title} Expression Challenge`,
          detail: 'You hit 14 days. Share what shifted, in person at a Circle or solo online, to finish this Journey.',
          href: `/journeys/${current.slug}`,
          label: 'Open the Journey',
        }
      : current.state === 'current'
        ? {
            k: 'Today',
            title: `Log a ${current.title} practice`,
            detail: `${current.daysLogged} of ${current.daysNeeded} days toward finishing ${current.title}.`,
            href: `/journeys/${current.slug}`,
            label: 'Open the Journey',
          }
        : {
            k: 'Up next',
            title: `${current.title} opens soon`,
            detail: `${current.title} is next in this Quest. Keep your daily practice going until it opens.`,
            href: `/journeys/${current.slug}`,
            label: 'See the Journey',
          }
    : {
        k: 'Today',
        title: 'Log a practice',
        detail: 'One logged practice keeps your streak alive and moves your season forward.',
        href: '/practices',
        label: 'Your practices',
      }
  return (
    <section className="panel mc-hero" aria-label="Today">
      <div className="fq-aura" aria-hidden />
      <span className={expressionNext ? 'ic mc-now' : 'ic mc-done'}>
        <FqIcon name={expressionNext ? 'standing' : 'compass'} />
      </span>
      <div className="stack grow mc-gap-10">
        <span className="k">{step.k}</span>
        <span className="h2">{step.title}</span>
        <span className="why">{step.detail}</span>
        <div className="row wrap">
          <Link className="btn pa lg" href={step.href}>
            {step.label}
          </Link>
          {withCta && (
            <Link className="btn" href="/practices">
              {toLog.length > 0 ? 'Log a practice' : 'See your practices'}
            </Link>
          )}
          <Link className="btn txt" href="/on-air">
            Tune out
          </Link>
        </div>
      </div>
    </section>
  )
}

async function Cta({ ctx }: { ctx: CrewContext }) {
  const toLog = await getPracticesToLogToday(ctx.profileId)
  return (
    <div className="row wrap">
      <Link className="btn pa" href="/practices">
        {toLog.length > 0 ? 'Log a practice' : 'See your practices'}
      </Link>
      <Link className="btn" href="/on-air">
        Tune out
      </Link>
    </div>
  )
}

async function MyPractices({ ctx }: { ctx: CrewContext }) {
  const mine = await getMemberPractices(ctx.profileId)
  if (mine.length === 0) return null
  return (
    <div>
      <div className="sec-h">
        <span className="h2">My practices</span>
        <Link className="meta" href="/practices">
          {mine.length} on your list
        </Link>
      </div>
      <div className="list">
        {mine.map((p) => (
          <Link key={p.id} href={`/practices/${p.id}`}>
            <span className="ic">
              <FqIcon name="practice" />
            </span>
            <span className="grow">
              <span className="t1 mc-block">{p.title}</span>
              {(p.cadence || p.summary) && <span className="t2">{p.cadence ?? p.summary}</span>}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

async function MyJourneys({ ctx }: { ctx: CrewContext }) {
  const journeys = await getMemberJourneyProgress(ctx.profileId, { activeOnly: false })
  if (journeys.length === 0) return null
  return (
    <div>
      <div className="sec-h">
        <span className="h2">Your Journeys</span>
        <Link className="meta" href="/journeys">
          All Journeys
        </Link>
      </div>
      <div className="stack">
        {journeys.map((j) => (
          <Link key={j.planId} className="panel stack" href={j.complete ? `/journeys/${j.slug}/learn` : (j.nextLesson?.href ?? `/journeys/${j.slug}/learn`)}>
            <div className="row">
              <span className="t1 grow">{j.title}</span>
              <span className="t2">
                {j.complete && !j.ongoing ? 'Finished' : j.nextLesson ? `Next: ${j.nextLesson.title}` : `${j.percent}%`}
                {j.inCohort ? ' · with your Circle' : ''}
              </span>
            </div>
            <div className="meter" role="img" aria-label={`${j.percent}% done`}>
              <i style={{ width: `${j.percent}%` }} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

async function NextGathering({ ctx }: { ctx: CrewContext }) {
  const g = await getNextGathering(ctx.profileId)
  if (!g) return null
  return (
    <Link className="panel stack" href={`/events/${g.slug}`}>
      <span className="k">{g.rsvped ? 'You’re going' : 'Your next gathering'}</span>
      <span className="h3">{g.title}</span>
      <span className="t2">
        {when(g.startsAt)}
        {g.location ? ` · ${g.location}` : ''}
      </span>
    </Link>
  )
}

async function CircleBoard({ ctx }: { ctx: CrewContext }) {
  const circleId = ctx.membership?.circleId
  if (!circleId) return null
  const admin = createAdminClient()
  const { data: members } = await admin.from('memberships').select('profile_id').eq('circle_id', circleId).eq('status', 'active')
  const ids = (members ?? []).map((m) => m.profile_id as string)
  if (ids.length === 0) return null
  const { data: rows } = await admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, current_season_zaps, current_season_rank, meta')
    .in('id', ids)
  const board = (rows ?? [])
    .filter((p) => p.id === ctx.profileId || !isOptedOut(p.meta as Record<string, unknown> | null))
    .map((p) => ({
      id: p.id as string,
      name: p.display_name as string,
      handle: p.handle as string | null,
      avatarUrl: p.avatar_url as string | null,
      zaps: (p.current_season_zaps as number | null) ?? 0,
      rank: ((p.current_season_rank as string | null) ?? 'ghost') as SeasonRank,
    }))
    .sort((a, b) => b.zaps - a.zaps)
    .slice(0, 5)
  if (board.length === 0) return null
  return (
    <div className="panel stack">
      <span className="k">{ctx.membership?.circleName ? `${ctx.membership.circleName} this season` : 'Your Circle this season'}</span>
      <div className="list">
        {board.map((m, i) => {
          const self = m.id === ctx.profileId
          const row = (
            <>
              <span className="t2 mc-place">{i + 1}</span>
              <FqAvatar url={m.avatarUrl} name={m.name} size="s" />
              <span className="grow">
                <span className={self ? 't1 mc-block' : 't1 mc-block mc-normal'}>{self ? 'You' : m.name}</span>
                <span className="t2">{getRankDef(m.rank).label}</span>
              </span>
              <span className="t1">⚡ {m.zaps.toLocaleString()}</span>
            </>
          )
          return m.handle ? (
            <Link key={m.id} href={`/people/${m.handle}`}>
              {row}
            </Link>
          ) : (
            <div key={m.id}>{row}</div>
          )
        })}
      </div>
      <Link className="btn sm" href="/crew/leaderboard">
        Open the leaderboard
      </Link>
    </div>
  )
}

const EXPLORE: { href: string; icon: FqIconName; label: string; sub: string }[] = [
  { href: '/journeys', icon: 'map', label: 'Journeys', sub: 'Browse and build' },
  { href: '/practices', icon: 'practice', label: 'Practices', sub: 'Log today' },
  { href: '/crew/challenges', icon: 'goal', label: 'Challenges', sub: 'Capstones and more' },
  { href: '/crew/store', icon: 'vault', label: 'The Vault', sub: 'Gems, Awards, standing' },
]

function Explore() {
  return (
    <div className="panel stack">
      <span className="k">Explore</span>
      <div className="list">
        {EXPLORE.map((e) => (
          <Link key={e.href} href={e.href}>
            <span className="ic">
              <FqIcon name={e.icon} />
            </span>
            <span className="grow">
              <span className="t1 mc-block">{e.label}</span>
              <span className="t2">{e.sub}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export async function CrewBody({ ctx }: { ctx: CrewContext; headerImage?: string | null }) {
  const order = await visibleModuleOrder('/crew')
  const shows = new Set(order)
  const left = weeksLeft(ctx.season)
  const meta = [
    ctx.season?.name ?? 'Between seasons',
    left !== null ? `${left} ${left === 1 ? 'week' : 'weeks'} left` : null,
    `${getRankDef(ctx.rank).label} · ${ctx.finishedCount} of 3 Journeys finished`,
    ctx.membership?.circleName ? `You're in ${ctx.membership.circleName}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // Today carries the CTA's buttons when both are on, so the page has one primary action.
  const ctaInToday = shows.has('quest-today') && shows.has('quest-cta')
  const sections: Record<string, React.ReactNode> = {
    'quest-finish-celebration': <QuestFinishCelebration />,
    'quest-intention': ctx.season?.theme ? (
      <div className="soft stack mc-start">
        <span className="k">{ctx.season.name ? `${ctx.season.name} · the intention` : 'This season'}</span>
        <span className="why mc-why-l">{ctx.season.theme}</span>
      </div>
    ) : null,
    'quest-season-map': <SeasonArcs ctx={ctx} />,
    'quest-today': <Today ctx={ctx} withCta={ctaInToday} />,
    'quest-cta': ctaInToday ? null : <Cta ctx={ctx} />,
    'quest-my-practices': <MyPractices ctx={ctx} />,
    'quest-journeys': <MyJourneys ctx={ctx} />,
    'quest-next-gathering': <NextGathering ctx={ctx} />,
    'quest-leaderboard': <CircleBoard ctx={ctx} />,
    'quest-explore': <Explore />,
  }
  const main = order.filter((id) => !SIDE.has(id))
  const side = order.filter((id) => SIDE.has(id))

  return (
    <MembersBody>
      <div className="head">
        <div>
          <span className="k">The Quest</span>
          <h1 className="h1">
            <SerifTail text="My Quest." />
          </h1>
          <span className="meta">{meta}</span>
        </div>
        <div className="row wrap">
          {ctx.isCrewLead && <span className="tag glass">Crew Lead</span>}
          <Link className="btn sm" href="/crew/leaderboard">
            Leaderboard
          </Link>
          <Link className="btn sm" href="/crew/store">
            The Vault
          </Link>
        </div>
      </div>
      <div className="ap-cols">
        <div className="mc-sections">
          {main.map((id) =>
            sections[id] ? (
              <div key={id} className="mc-section">
                <Suspense fallback={null}>{sections[id]}</Suspense>
              </div>
            ) : null,
          )}
        </div>
        <aside className="side">
          {side.map((id) => (
            <Suspense key={id} fallback={null}>
              {sections[id]}
            </Suspense>
          ))}
          <Suspense fallback={null}>
            <HubLinks title="The Quest" boxed links={(v) => hubLinks('/crew', v)} />
          </Suspense>
        </aside>
      </div>
    </MembersBody>
  )
}
