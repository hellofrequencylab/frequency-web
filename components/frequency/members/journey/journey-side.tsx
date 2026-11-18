import Link from 'next/link'
import { FqAvatar, phStyle } from '@/components/frequency/members/shared/avatar'
import { friendsLine, type JourneyFriend } from '@/lib/journeys/friends-on-journey'

// The Journey side column, shared by the sales page and the course home under Frequency
// (design_handoff/frequency/templates/members/Journey.html, `aside.side`): who is on it, then More
// Journeys. Every figure is read; the faces are the viewer's own friends, never strangers.

export interface MoreJourney {
  slug: string
  title: string
  coverImage: string | null
  adoptCount: number
  /** "4 weeks", "3 phases": the shape, when the caller knows it. */
  shape?: string | null
}

export function peopleLine(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? 'person' : 'people'} on this Journey`
}

/** "On this Journey": the friends on it (faces + one line), the count, then any extra rows. */
export function OnThisJourneyPanel({
  friends,
  adoptCount,
  children,
}: {
  friends: JourneyFriend[]
  adoptCount: number
  children?: React.ReactNode
}) {
  const line = friendsLine(friends)
  return (
    <div className="panel stack">
      <span className="k">On this Journey</span>
      {friends.length > 0 && (
        <div className="faces">
          {friends.map((f) =>
            f.handle ? (
              <Link key={f.id} href={`/people/${f.handle}`} aria-label={f.name}>
                <FqAvatar url={f.avatarUrl} name={f.name} />
              </Link>
            ) : (
              <FqAvatar key={f.id} url={f.avatarUrl} name={f.name} />
            ),
          )}
        </div>
      )}
      <span className="t2">
        {line ? `${line} ` : ''}
        {peopleLine(adoptCount)}.
      </span>
      {children}
    </div>
  )
}

export function MoreJourneysPanel({ more }: { more: MoreJourney[] }) {
  if (more.length === 0) return null
  return (
    <div className="panel stack">
      <div className="row">
        <span className="k grow">More Journeys</span>
        <Link className="t2" href="/journeys">
          See all
        </Link>
      </div>
      <div className="list">
        {more.map((j) => (
          <Link key={j.slug} href={`/journeys/${j.slug}`}>
            <span className="ph mc-thumb" style={phStyle(j.coverImage)} aria-hidden />
            <span className="grow">
              <span className="t1 mc-block">{j.title}</span>
              <span className="t2">{[j.shape, peopleLine(j.adoptCount)].filter(Boolean).join(' · ')}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** The guide, in the kit: their face, their name, a door to their profile. */
/** Who leads this Journey (owner 2026-11-17). Its GUIDES, the people named on it, in order; with none, the
 *  Space that hosts it is the guide; a member's own Journey (no host Space) falls back to its author. */
export function GuidePanel({
  guides = [],
  host = null,
  author = null,
}: {
  guides?: Array<{ handle: string; displayName: string; avatarUrl: string | null }>
  host?: { slug: string; name: string; logoUrl: string | null } | null
  author?: { handle: string; displayName: string; avatarUrl: string | null } | null
}) {
  if (guides.length > 0) {
    return (
      <div className="panel stack">
        <span className="k">{guides.length > 1 ? 'Your guides' : 'Your guide'}</span>
        {guides.map((g) => (
          <Link key={g.handle} className="row" href={`/people/${g.handle}`}>
            <FqAvatar url={g.avatarUrl} name={g.displayName} size="m" />
            <span className="grow">
              <span className="t1 mc-block">{g.displayName}</span>
              <span className="t2">@{g.handle}</span>
            </span>
          </Link>
        ))}
        {host ? (
          <Link className="t2" href={`/spaces/${host.slug}`}>
            Hosted by {host.name}
          </Link>
        ) : null}
      </div>
    )
  }
  if (host) {
    return (
      <div className="panel stack">
        <span className="k">Your guide</span>
        <Link className="row" href={`/spaces/${host.slug}`}>
          <FqAvatar url={host.logoUrl} name={host.name} size="m" />
          <span className="grow">
            <span className="t1 mc-block">{host.name}</span>
            <span className="t2">Hosts and guides this Journey.</span>
          </span>
        </Link>
      </div>
    )
  }
  if (!author) return null
  return (
    <div className="panel stack">
      <span className="k">Your guide</span>
      <Link className="row" href={`/people/${author.handle}`}>
        <FqAvatar url={author.avatarUrl} name={author.displayName} size="m" />
        <span className="grow">
          <span className="t1 mc-block">{author.displayName}</span>
          <span className="t2">Built this Journey. See their profile.</span>
        </span>
      </Link>
    </div>
  )
}
