import '@/app/themes/frequency/members-events.css'

// THE EVENTS WAIT, UNDER FREQUENCY: the destination's own frame (the hero, the tab bar, a grid of
// card shapes), so nothing jumps when the list lands. Drawn from the same ev-* classes the page uses.

export function FqEventsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading events">
      <div className="ev-hero">
        <div className="ev-hero-in">
          <span className="ev-skel-bar w30" />
          <span className="ev-skel-bar tall w60" />
          <span className="ev-search" />
        </div>
      </div>
      <div className="ev-bar">
        <span className="ev-skel-bar w30" />
      </div>
      <div className="ev-list">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="ev-card">
            <span className="ev-cover" />
            <div className="ev-b">
              <span className="ev-skel-bar w30" />
              <span className="ev-skel-bar tall w60" />
              <span className="ev-skel-bar w45" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
