import Link from 'next/link'
import { ArrowRight, CalendarDays, CircleDot, Megaphone, Radio, Users, Zap } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { ContextActions } from '@/components/context-actions'
import { EmptyState } from '@/components/ui/empty-state'

// Around You, under the map, in the Frequency members kit (LIVE-1073). The page used to stack a ticker,
// a stat row, two lists, a face row and a two-column Dispatch stream. This keeps the ticker (rendered by
// the page) and folds the rest into one board: four tally tiles that double as tabs, one panel for the
// list the member picked, then three doors to make something happen. Server Component, no state: the tab
// is `?tab=`, so a tile is a link and the page stays one cacheable read.
//
// It is pure presentation. Every row arrives already filtered and formatted by the page, which owns the
// service-role reads and their visibility rules; nothing here reads the database.

export type BoardTab = 'events' | 'circles' | 'people' | 'dispatches'

export const BOARD_TABS: readonly BoardTab[] = ['events', 'circles', 'people', 'dispatches']

export function parseBoardTab(raw: string | undefined, composing: boolean): BoardTab {
  if (raw && (BOARD_TABS as readonly string[]).includes(raw)) return raw as BoardTab
  return composing ? 'dispatches' : 'events'
}

type BoardEvent = { id: string; slug: string; title: string; month: string; day: string; when: string; badge: string | null; where: string | null }
type BoardCircle = { id: string; slug: string; name: string; memberLabel: string; city: string | null }
type BoardPerson = { id: string; handle: string; name: string; avatarUrl: string | null; joined: string }
type BoardDispatch = {
  id: string
  title: string
  excerpt: string | null
  context: string
  authorName: string | null
  time: string
  linked: boolean
  isAuthor: boolean
  showActions: boolean
}

export type AroundYouBoardProps = {
  tab: BoardTab
  counts: { events: number; circles: number; people: number; dispatches: number }
  notes: { circles?: string; people?: string }
  events: BoardEvent[]
  circles: BoardCircle[]
  circlesTitle: string
  people: BoardPerson[]
  dispatches: BoardDispatch[]
  viewerRole: React.ComponentProps<typeof ContextActions>['role']
  dispatchActions?: React.ReactNode
  /** The Dispatch ticker, seated first so the board's one gap spaces it like everything else. */
  ticker?: React.ReactNode
}

const TAB_META: Record<BoardTab, { label: string; href: string; all: string; Icon: React.ElementType }> = {
  events: { label: 'Upcoming events', href: '/events', all: 'See every event', Icon: CalendarDays },
  circles: { label: 'Circles', href: '/circles', all: 'See every circle', Icon: CircleDot },
  people: { label: 'Members', href: '/network', all: 'See the network', Icon: Users },
  dispatches: { label: 'Dispatches this week', href: '/nearby', all: '', Icon: Megaphone },
}

export function AroundYouBoard(p: AroundYouBoardProps) {
  const meta = TAB_META[p.tab]
  return (
    <div className="ay">
      {p.ticker}
      <nav aria-label="Around You" data-visual-mask="nearby-board-stats" className="ay-stats">
        {BOARD_TABS.map((t) => {
          const m = TAB_META[t]
          const on = t === p.tab
          return (
            <Link
              key={t}
              href={`/nearby?tab=${t}`}
              scroll={false}
              prefetch={false}
              aria-current={on ? 'true' : undefined}
              className={`ay-stat${on ? ' on' : ''}`}
            >
              <m.Icon aria-hidden />
              <span className="ay-stat-num">{p.counts[t].toLocaleString()}</span>
              <span className="ay-stat-label">{m.label}</span>
              {(t === 'circles' ? p.notes.circles : t === 'people' ? p.notes.people : undefined) && (
                <span className="ay-stat-note">{t === 'circles' ? p.notes.circles : p.notes.people}</span>
              )}
            </Link>
          )
        })}
      </nav>

      <section id="dispatches" aria-label={meta.label} className="panel ay-panel scroll-mt-24">
        <div className="ay-panel-h">
          <h2>{p.tab === 'circles' ? p.circlesTitle : p.tab === 'events' ? 'Happening near you' : p.tab === 'people' ? 'New to the community' : 'Latest Dispatches'}</h2>
          {p.tab === 'dispatches' ? p.dispatchActions : <Link href={meta.href} className="btn txt sm">{meta.all}<ArrowRight aria-hidden /></Link>}
        </div>

        <div data-visual-mask="nearby-board-panel">
          {p.tab === 'events' && (p.events.length > 0 ? (
            <ul className="ay-grid">
              {p.events.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.slug}`} className="ay-tile">
                    <span className="ay-date">{e.month}<b>{e.day}</b></span>
                    <span className="ay-tile-body">
                      {e.badge && <span className="tag live">{e.badge}</span>}
                      <span className="ay-tile-title">{e.title}</span>
                      <span className="ay-tile-meta">{e.when}{e.where ? ` · ${e.where}` : ''}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Nothing on the calendar yet"
              description="Be the first to put a gathering on it. Hosts can start one in a minute."
              action={<Link href="/events/new" className={buttonClasses('primary', 'sm')}>Host an event</Link>}
            />
          ))}

          {p.tab === 'circles' && (p.circles.length > 0 ? (
            <ul className="ay-grid">
              {p.circles.map((c) => (
                <li key={c.id}>
                  <Link href={`/circles/${c.slug}`} className="ay-tile">
                    <span className="ay-ic"><CircleDot aria-hidden /></span>
                    <span className="ay-tile-body">
                      <span className="ay-tile-title">{c.name}</span>
                      <span className="ay-tile-meta">{c.memberLabel}{c.city ? ` · ${c.city}` : ''}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CircleDot}
              title="No new circles this week"
              description="Start one around something you care about and the first people to find it will be neighbors."
              action={<Link href="/circles/new" className={buttonClasses('primary', 'sm')}>Start a circle</Link>}
            />
          ))}

          {p.tab === 'people' && (p.people.length > 0 ? (
            <ul className="ay-faces">
              {p.people.map((m) => (
                <li key={m.id}>
                  <Link href={`/people/${m.handle}`} className="ay-tile ay-face">
                    <span
                      className="av m"
                      style={m.avatarUrl ? { backgroundImage: `url("${m.avatarUrl}")` } : undefined}
                      aria-hidden
                    >
                      {m.avatarUrl ? null : m.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="ay-tile-title">{m.name}</span>
                    <span className="ay-tile-meta">Joined {m.joined}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Users}
              title="No new faces this fortnight"
              description="When someone joins and lists themselves in the directory, they show up here."
            />
          ))}

          {p.tab === 'dispatches' && (p.dispatches.length > 0 ? (
            <ul className="ay-grid">
              {p.dispatches.map((d) => (
                <li key={d.id}>
                  <div className="ay-tile">
                    <span className="ay-ic">{d.linked ? <Zap aria-hidden /> : <Megaphone aria-hidden />}</span>
                    <Link href={`/nearby/${d.id}`} className="ay-tile-body grow">
                      <span className="ay-tile-meta">{d.context}</span>
                      <span className="ay-tile-title">{d.title}</span>
                      {d.excerpt && <span className="ay-tile-desc">{d.excerpt}</span>}
                      <span className="ay-tile-meta">{d.authorName ? `${d.authorName} · ` : ''}{d.time}</span>
                    </Link>
                    {d.showActions && (
                      <ContextActions role={p.viewerRole} context={{ type: 'dispatch', id: d.id, isAuthor: d.isAuthor }} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Megaphone}
              title="No Dispatches yet"
              description="Your hosts and guides post announcements, events, and challenges here. When they do, they scroll across the top of this page."
            />
          ))}
        </div>
      </section>

      <section aria-label="Do something" className="ay-doors">
        <Door href="/events/new" Icon={CalendarDays} title="Host a gathering" body="Put a time and place on the calendar and let the neighborhood find it." />
        <Door href="/circles/new" Icon={CircleDot} title="Start a circle" body="Gather a few people around one thing you keep coming back to." />
        <Door href="/channels" Icon={Radio} title="Join a conversation" body="Pick a channel by topic and say hello." />
      </section>
    </div>
  )
}

function Door({ href, Icon, title, body }: { href: string; Icon: React.ElementType; title: string; body: string }) {
  return (
    <Link href={href} className="panel ay-door">
      <span className="ay-ic"><Icon aria-hidden /></span>
      <span className="ay-door-title">{title}<ArrowRight aria-hidden /></span>
      <p>{body}</p>
    </Link>
  )
}
