import Link from 'next/link'
import '@/app/themes/frequency/members-b.css'
import type { CirclesIndexData } from '@/lib/circles/index-data'
import type { CircleCardData } from '@/components/circles/circle-card'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'

// CIRCLES, FREQUENCY BODY (templates/members/Circles.html). The head with Start a Circle, the
// viewer's own Circles as photo cards, then everything else under "Near you" with the Channel chips.
// Everything is the live index read (getCirclesIndexData): the cards, the viewer's memberships and
// the Channel filters (real links, so the filter stays shareable and server-side).

function CircleTile({ c }: { c: CircleCardData }) {
  const href = c.isStarter ? `/circles/starter/${c.slug}` : `/circles/${c.slug}`
  const first = [
    `${c.member_count} ${c.member_count === 1 ? 'member' : 'members'}`,
    c.isStarter ? 'Starter' : c.status === 'forming' ? 'Forming' : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const second = c.context ?? (c.type === 'online' ? 'Online' : null)
  return (
    <Link className="card fqm-card" href={href}>
      <span className="ph" style={c.imageUrl ? { backgroundImage: `url('${c.imageUrl}')` } : undefined}>
        {c.isFeatured && <span className="tag glass fqm-corner">Featured</span>}
      </span>
      <span className="fqm-card-b">
        <span className="h3">{c.name}</span>
        <span className="t2">{first}</span>
        {second && <span className="t2 fqm-body-ink">{second}</span>}
      </span>
    </Link>
  )
}

export function FqCirclesBody({ data }: { data: CirclesIndexData }) {
  const { cards, myCircleIds, channelLinks, signedIn, canCreate, interests, filtering } = data
  const mine = new Set(myCircleIds)
  const yours = cards.filter((c) => mine.has(c.id))
  const near = cards.filter((c) => !mine.has(c.id))

  return (
    <>
      <div className="head">
        <div>
          <span className="k">Community</span>
          <h1 className="h1">
            Your <span className="serif">Circles.</span>
          </h1>
          <span className="meta">The groups you keep coming back to.</span>
        </div>
        {signedIn && (
          <div className="row wrap">
            <NewCircleCompose interests={interests} buttonLabel="Start a Circle" canCreate={canCreate} buttonClass="btn pa lg" />
            {canCreate && (
              <Link className="btn lg" href="/lead">
                Manage my Circles
              </Link>
            )}
          </div>
        )}
      </div>

      {yours.length > 0 ? (
        <div className="g3">
          {yours.map((c) => (
            <CircleTile key={c.id} c={c} />
          ))}
        </div>
      ) : (
        !filtering && (
          <div className="soft stack">
            <span className="h3">{signedIn ? 'No Circles yet.' : 'Find your people.'}</span>
            <span className="t2">
              {signedIn
                ? 'Join one below and it lives here, with its next meetup one tap away.'
                : 'Sign in to join a Circle and keep it here.'}
            </span>
          </div>
        )
      )}

      <div className="sec">
        <div className="sec-h">
          <span className="h2">Near you</span>
          <span className="meta">
            {near.length} {near.length === 1 ? 'Circle' : 'Circles'}
          </span>
        </div>
        <nav className="chips fqm-chips" aria-label="Channels">
          {channelLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={l.active ? 'chip on' : 'chip'}
              aria-current={l.active ? 'page' : undefined}
            >
              {l.label === 'All' ? 'Anything' : l.label}
            </Link>
          ))}
        </nav>
        {near.length > 0 ? (
          <div className="g3">
            {near.map((c) => (
              <CircleTile key={c.id} c={c} />
            ))}
          </div>
        ) : (
          <div className="empty stack">
            <span className="h3">Nothing here yet.</span>
            <span className="t2">Try another Channel, or start the Circle you were looking for.</span>
          </div>
        )}
      </div>
    </>
  )
}
