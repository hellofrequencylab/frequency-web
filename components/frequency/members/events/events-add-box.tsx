import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'

// ADD AN EVENT (LIVE-1016, owner 2026-10-19: "an Add an Event feature box at the bottom ... a Login / Sign Up
// lead capture box for roles that don't meet the tier"). The close of the Events page. Any signed-in member
// may host (the `member` gate on /events/new), so they get the Create door with Drafts and Manage when they
// have added one; a visitor gets the same box as a lead capture: sign up to host, or sign in, and what hosting
// takes in one line each. Server component, no state.

const STEPS = [
  { icon: 'event', t: 'Post it', d: 'Date, place and a cover. Free or ticketed.' },
  { icon: 'contacts', t: 'Fill it', d: 'Members near you see it in Around you and RSVP.' },
  { icon: 'check', t: 'Run it', d: 'Check people in and keep the crowd after.' },
] as const

export function EventsAddBox({ signedIn, userHasEvents }: { signedIn: boolean; userHasEvents: boolean }) {
  return (
    <section className="ev-add" aria-labelledby="ev-add-h">
      <div className="ev-add-in">
        <span className="k">Host</span>
        <h2 id="ev-add-h" className="h2">
          Add an <span className="serif">event.</span>
        </h2>
        <p className="body">
          {signedIn
            ? 'Hosting something near you? Post it and it lands in front of the people around you.'
            : 'Hosting something near you? Make a free Frequency account to post it in front of the people around you.'}
        </p>
        <div className="ev-add-acts">
          {signedIn ? (
            <>
              <Link className="btn pa" href="/events/new">
                <FqIcon name="plus" />
                New event
              </Link>
              {userHasEvents && (
                <>
                  <Link className="btn" href="/drafts">
                    Drafts
                  </Link>
                  <Link className="btn" href="/admin/events">
                    Manage
                  </Link>
                </>
              )}
            </>
          ) : (
            <>
              <Link className="btn pa" href="/join">
                Sign up to host
              </Link>
              <Link className="btn" href={`/sign-in?next=${encodeURIComponent('/events/new')}`}>
                Log in
              </Link>
            </>
          )}
        </div>
      </div>
      <ol className="ev-add-steps" aria-label="How hosting works">
        {STEPS.map((s) => (
          <li key={s.t}>
            <span className="ic">
              <FqIcon name={s.icon} />
            </span>
            <b>{s.t}</b>
            <span className="t2">{s.d}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
