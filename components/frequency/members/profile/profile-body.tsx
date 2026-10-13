import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { MembersBody, SerifTail } from '@/components/frequency/members/shared/members-body'

// A MEMBER PROFILE under Frequency (design_handoff/frequency/templates/members/Profile.html), for the
// member's own page and anyone else's. app/(main)/people/[handle]/page.tsx keeps every read, privacy
// gate and control it had (friend, message, tip, block, act-as, staff drawer, the inline bio editor,
// the composer, the Spotlight grid, associations, awards) and passes them here already built and
// already gated; this body only places them on the reference:
//
//   identity row   the photo, "region · member since", the name, rank / Crew / status chips, the bio,
//                  the actions
//   four numbers   real counts only (see the page for what each one reads)
//   columns        Story · Posts · Circles · Practice tabs (?tab=, server-rendered)  |  what they run,
//                  standing, achievements, awards, the Crew card

export interface ProfileStat {
  value: string
  label: string
}

export interface ProfileTabLink {
  key: string
  label: string
  href: string
}

export function ProfileBody({
  notice,
  avatar,
  metaLine,
  name,
  chips,
  bio,
  actions,
  secondary,
  stats,
  panels,
  tabs,
  activeTab,
  tabContent,
  side,
}: {
  notice: React.ReactNode
  avatar: React.ReactNode
  metaLine: React.ReactNode
  name: string
  chips: React.ReactNode
  bio: React.ReactNode
  actions: React.ReactNode
  /** Block, Act as: the low-weight controls, on their own line. */
  secondary: React.ReactNode
  stats: ProfileStat[]
  /** The viewer-specific panels above the tabs (private contact, how you're connected, support, Spotlight). */
  panels: React.ReactNode
  tabs: ProfileTabLink[]
  activeTab: string
  tabContent: React.ReactNode
  side: React.ReactNode
}) {
  return (
    <MembersBody>
      {notice}
      <section className="row wrap mc-identity">
        {avatar}
        <div className="stack grow mc-gap-12">
          <span className="meta">{metaLine}</span>
          <h1 className="h1">
            <SerifTail text={name} />
          </h1>
          {chips}
          {bio}
          {secondary}
        </div>
        <div className="row wrap">{actions}</div>
      </section>

      <div className="g4 sec mc-stats">
        {stats.map((s) => (
          <div key={s.label} className="stack mc-gap-8">
            <span className="num">{s.value}</span>
            <span className="t2">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="ap-cols sec">
        <div className="stack mc-gap-24">
          {panels}
          <div>
            <nav className="tabs" aria-label="Profile">
              {tabs.map((t) => (
                <Link
                  key={t.key}
                  href={t.href}
                  className={t.key === activeTab ? 'on' : undefined}
                  aria-current={t.key === activeTab ? 'page' : undefined}
                  scroll={false}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
            <div className="mc-top-20">{tabContent}</div>
          </div>
        </div>
        <aside className="side">{side}</aside>
      </div>
    </MembersBody>
  )
}

/** The photo, in the kit's xl avatar. Initials when there is no photo. */
export function ProfilePhoto({ src, initials, name }: { src: string | null; initials: string; name: string }) {
  return src ? (
    <span
      className="av xl mc-photo"
      role="img"
      aria-label={name}
      style={{ backgroundImage: `url(${JSON.stringify(src)})` }}
    />
  ) : (
    <span className="av xl mc-photo mc-initials" role="img" aria-label={name}>
      {initials}
    </span>
  )
}

/** Circles tab: the Circles a stranger could find by browsing (the page narrows the read), each with
 *  its photo, when this member joined, and how many of its gatherings they were marked at. */
export function ProfileCircles({
  circles,
  emptyLine,
}: {
  circles: { id: string; name: string; slug: string; imageUrl?: string | null; since?: string | null; checkins?: number }[]
  emptyLine: string
}) {
  if (circles.length === 0) {
    return (
      <div className="empty">
        <p className="why">{emptyLine}</p>
      </div>
    )
  }
  return (
    <div className="list">
      {circles.map((c) => {
        const sub = [c.since ?? null, c.checkins ? `${c.checkins} ${c.checkins === 1 ? 'check-in' : 'check-ins'}` : null]
          .filter(Boolean)
          .join(' · ')
        return (
          <Link key={c.id} href={`/circles/${c.slug}`}>
            {c.imageUrl ? (
              <span className="av m" style={{ backgroundImage: `url(${JSON.stringify(c.imageUrl)})` }} aria-hidden />
            ) : (
              <span className="ic">
                <FqIcon name="circle" />
              </span>
            )}
            <span className="grow">
              <span className="t1 mc-block">{c.name}</span>
              {sub && <span className="t2">{sub}</span>}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

/** Practice tab, the owner's own view: the Journeys they are on (progress) and their practices by
 *  sessions, as the reference's meter panels. Visitors see the Signature alone. */
export function ProfilePractice({
  journeys,
  practices,
  children,
}: {
  journeys: { slug: string; title: string; percent: number; line: string }[]
  practices: { id: string; title: string; href: string | null; sessions: number }[]
  /** The Frequency Signature, beneath. */
  children: React.ReactNode
}) {
  const most = practices.reduce((n, p) => Math.max(n, p.sessions), 0)
  return (
    <div className="stack mc-gap-24">
      {(journeys.length > 0 || practices.length > 0) && (
        <div className="stack">
          {journeys.map((j) => (
            <Link key={j.slug} className="panel stack" href={`/journeys/${j.slug}/learn`}>
              <div className="row">
                <span className="t1 grow">{j.title}</span>
                <span className="t2">{j.line}</span>
              </div>
              <div className="meter" role="img" aria-label={`${j.percent}% done`}>
                <i style={{ width: `${j.percent}%` }} />
              </div>
            </Link>
          ))}
          {practices.map((p) => {
            const inner = (
              <>
                <div className="row">
                  <span className="t1 grow">{p.title}</span>
                  <span className="t2">
                    {p.sessions} {p.sessions === 1 ? 'session' : 'sessions'}
                  </span>
                </div>
                <div className="meter" aria-hidden>
                  <i style={{ width: `${most > 0 ? Math.round((p.sessions / most) * 100) : 0}%` }} />
                </div>
              </>
            )
            return p.href ? (
              <Link key={p.id} className="panel stack" href={p.href}>
                {inner}
              </Link>
            ) : (
              <div key={p.id} className="panel stack">
                {inner}
              </div>
            )
          })}
        </div>
      )}
      {children}
    </div>
  )
}

/** Standing: Zaps, Gems, streak and the rank climb, in the kit. Rows link for the owner only. */
export function ProfileStanding({
  isOwner,
  rankLabel,
  nextLabel,
  pct,
  zapsToNext,
  rows,
}: {
  isOwner: boolean
  rankLabel: string
  nextLabel: string | null
  pct: number
  zapsToNext: number
  rows: { label: string; value: string; href: string }[]
}) {
  return (
    <div className="panel stack">
      <div className="row">
        <span className="k grow">Standing</span>
        <span className="tag glass">{rankLabel}</span>
      </div>
      {nextLabel ? (
        <div className="stack mc-gap-6">
          <div className="row">
            <span className="t2 grow">Climbing to {nextLabel}</span>
            <span className="t2">{zapsToNext.toLocaleString()} ⚡ to go</span>
          </div>
          <div className="meter">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <span className="t2">Top rank reached</span>
      )}
      <div className="list">
        {rows.map((r) =>
          isOwner ? (
            <Link key={r.label} href={r.href}>
              <span className="t1 grow">{r.label}</span>
              <span className="t2">{r.value}</span>
            </Link>
          ) : (
            <div key={r.label}>
              <span className="t1 grow">{r.label}</span>
              <span className="t2">{r.value}</span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

/** Achievements: earned first, then the nearest, with progress on the ones not yet earned. */
export function ProfileAchievements({
  items,
}: {
  items: { label: string; description: string; earned: boolean; current: number; target: number; milestone?: boolean }[]
}) {
  const earned = items.filter((i) => i.earned).length
  return (
    <div className="panel stack">
      <div className="row">
        <span className="k grow">Achievements</span>
        <span className="t2">
          {earned} of {items.length}
        </span>
      </div>
      <div className="list">
        {items.map((i) => (
          <div key={i.label}>
            <span className={i.earned ? 'ic mc-done' : 'ic'}>
              <FqIcon name={i.earned ? 'check' : 'award'} />
            </span>
            <span className="grow">
              <span className={i.earned ? 't1 mc-block' : 't1 mc-block mc-faint'}>{i.label}</span>
              <span className="t2">{i.description}</span>
            </span>
            {!i.earned && !i.milestone && (
              <span className="t2">
                {Math.min(i.current, i.target)}/{i.target}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
