import Link from 'next/link'
import type { ReactNode } from 'react'
import '@/app/themes/active/members-b'

// CIRCLE MEMBERS PANE (templates/members/Circle.html, the Members tab): the roster as a four-up grid
// of faces, name and role. The page keeps the reads and the gates; a manager's role picker rides
// under each face it may change, exactly as it does under DAWN.

export type FqRosterPerson = {
  id: string
  handle: string
  name: string
  avatarUrl: string | null
  role: string
  /** The role picker, for a viewer who may set this member's role. */
  control?: ReactNode
}

export function FqMembersPane({
  people,
  seatsLine,
  empty,
  legend,
  youAreHere,
}: {
  people: FqRosterPerson[]
  seatsLine: string
  /** Rendered instead of the grid when the host is the only one here. */
  empty: ReactNode | null
  legend: ReactNode
  youAreHere: boolean
}) {
  return (
    <section aria-label="Members">
      <div className="sec-h">
        <span className="t2">
          {people.length} {people.length === 1 ? 'member' : 'members'}
        </span>
        <span className="meta">{seatsLine}</span>
      </div>
      {empty ?? (
        <div className="g4 fqm-pane">
          {people.map((p) => (
            <div key={p.id} className="fqm-person">
              <Link className="fqm-person" href={`/people/${p.handle}`}>
                <span className="av l" style={p.avatarUrl ? { backgroundImage: `url('${p.avatarUrl}')` } : undefined} />
                <span className="t1">{p.name}</span>
                <span className="t2">{p.role}</span>
              </Link>
              {p.control}
            </div>
          ))}
        </div>
      )}
      {legend}
      {youAreHere && <p className="t2">You are in this circle.</p>}
    </section>
  )
}
