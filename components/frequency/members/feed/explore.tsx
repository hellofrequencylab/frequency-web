import Link from 'next/link'
import { loadCirclesToExplore } from '@/lib/feed/circles-to-explore'
import { distanceLabel } from '@/lib/feed/home-rank'
import { phStyle } from '../shared/avatar'
import { SystemNotice } from '../shared/system-notice'

// "Circles to explore": the Feed's way out of the scroll. Three Circles the member is not in, each a
// door to a real group, with the Circles index one tap away. When there is nothing to suggest, the
// section says so and offers to start one (LIVE-1022, LIVE-1023).

export async function ExploreSection({ mine, home, lead }: { mine: string[]; home: { lat: number; lng: number } | null; lead: string }) {
  const circles = await loadCirclesToExplore({ mine, home })
  return (
    <section aria-label="Circles to explore">
      <div className="fa-sh">
        <span className="fa-h18">{lead}</span>
        <Link href="/circles" className="fa-f13 fa-seeall">
          See all Circles
        </Link>
      </div>
      {circles.length === 0 ? (
        <SystemNotice
          icon="circle"
          title="No new Circles to suggest right now."
          body="You may be in all of them. Start one and your neighbors can find it."
          actions={[{ href: '/circles', label: 'Browse Circles', primary: true }]}
        />
      ) : (
        <div className="fa-explore">
          {circles.map((c) => {
            const dist = distanceLabel(c.distanceMi)
            const meta = [c.place, dist, `${c.memberCount} ${c.memberCount === 1 ? 'member' : 'members'}`].filter(Boolean).join(' · ')
            return (
              <Link key={c.id} href={`/circles/${c.slug}`} className="fa-explore-card">
                <span className="fa-explore-ph ph" style={phStyle(c.imageUrl)} aria-hidden />
                <span className="fa-explore-txt">
                  <b>{c.name}</b>
                  <span className="t2">{meta}</span>
                  {c.about && <span className="fa-explore-about">{c.about}</span>}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
