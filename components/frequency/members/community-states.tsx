import Link from 'next/link'
import '@/app/themes/frequency/members-b.css'
import '@/app/themes/frequency/members-community.css'

// THE WAIT AND THE DEAD END FOR THE COMMUNITY PAGES, IN THE KIT (Circles, a Circle, Marketplace,
// Search). Under the Frequency design the route-level loading.tsx / not-found.tsx files draw these
// instead of the DAWN skeletons, which painted a hero band and a card list in DAWN's shapes and then
// reflowed into the kit's head, find row and grid. Each wait is cut from the page it stands in for:
// the same head, the same find pill, the same grid or cover, in the kit's neutral photo tile.
// Server Components with no reads, so they paint at once. The error boundaries' kit face is
// community-error.tsx (a client file, as an error boundary must be).

function Sk({ className }: { className: string }) {
  return <span className={`ph fqm-sk ${className}`} aria-hidden="true" />
}

function Busy({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      {children}
    </div>
  )
}

function Head() {
  return (
    <div className="stack fqm-sk-head">
      <Sk className="fqm-sk-k" />
      <Sk className="fqm-sk-h1" />
      <Sk className="fqm-sk-meta" />
    </div>
  )
}

/** The Circles index and the Marketplace doors: head, find row, chips, then the card grid. */
export function FqIndexLoading({ label, shape }: { label: string; shape: 'circles' | 'items' }) {
  const cells = shape === 'circles' ? 6 : 8
  return (
    <Busy label={label}>
      <Head />
      <Sk className="fqm-sk-find" />
      <div className="chips fqm-chips">
        {Array.from({ length: 4 }).map((_, i) => (
          <Sk key={i} className="fqm-sk-chip" />
        ))}
      </div>
      <div className={shape === 'circles' ? 'g3' : 'g4'}>
        {Array.from({ length: cells }).map((_, i) => (
          <Sk key={i} className={shape === 'circles' ? 'fqm-sk-card' : 'fqm-sk-item'} />
        ))}
      </div>
    </Busy>
  )
}

/** One Circle on a cold open: the back link, the cover, then the meetup, tabs and posts beside the
 *  About and This Circle panels (templates/members/Circle.html). */
export function FqCircleLoading() {
  return (
    <Busy label="Loading this Circle">
      <span className="meta fqm-back">← Circles</span>
      <Sk className="fqm-sk-hero" />
      <div className="ap-cols sec">
        <div className="fqm-sk-list">
          <Sk className="fqm-sk-row" />
          <FqPaneLoading />
        </div>
        <aside className="side">
          <Sk className="fqm-sk-panel" />
          <Sk className="fqm-sk-panel" />
        </aside>
      </div>
    </Busy>
  )
}

/** A Circle tab body swapping under a painted shell. */
export function FqPaneLoading() {
  return (
    <div className="fqm-sk-list fqm-pane" aria-busy="true">
      <span className="sr-only" role="status">
        Loading
      </span>
      {Array.from({ length: 3 }).map((_, i) => (
        <Sk key={i} className="fqm-sk-row" />
      ))}
    </div>
  )
}

/** Search: the label, the big field, the kind chips, then result rows beside the side panels. */
export function FqSearchLoading() {
  return (
    <Busy label="Searching">
      <div className="stack fqm-search-head">
        <Sk className="fqm-sk-k" />
        <Sk className="fqm-sk-find" />
        <div className="chips">
          {Array.from({ length: 5 }).map((_, i) => (
            <Sk key={i} className="fqm-sk-chip" />
          ))}
        </div>
      </div>
      <div className="ap-cols sec fqm-search-cols">
        <div className="fqm-sk-list">
          {Array.from({ length: 5 }).map((_, i) => (
            <Sk key={i} className="fqm-sk-row" />
          ))}
        </div>
        <aside className="side">
          <Sk className="fqm-sk-panel" />
        </aside>
      </div>
    </Busy>
  )
}

/** A Circle or a listing that is not there (or not for this viewer: a draft 404s to everyone but its
 *  managers, and an unlisted Circle is only hidden from browse, never from its link). */
export function FqNotFound({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <div className="empty stack">
      <h1 className="h3">{title}</h1>
      <span className="t2">{body}</span>
      <div>
        <Link className="btn pa" href={href}>
          {cta}
        </Link>
      </div>
    </div>
  )
}
