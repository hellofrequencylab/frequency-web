import '@/app/themes/active/members-events'

// THE EVENTS WAIT, UNDER FREQUENCY: the destination's own frame, in the page's order, so nothing jumps
// when the list lands: the plain header (kicker, title, one line), the Around You feature, the one
// toolbar, then the three-across grid. Drawn from the same ev-* and ay-* classes the page uses.
// The header is `ev-hero is-plain`, exactly as events-body.tsx renders it. A bare `ev-hero` is the
// retired photo band (min-height 360px on the ink fill), which painted a black block where the header
// used to be on every cold open of /events (LIVE-1010). The search sits in the toolbar under the
// feature, not in the header, since LIVE-1014 moved it there (LIVE-1042).

/** The Around You feature's wait: its own frame, so nothing jumps when the picks land. Lives here so the
 *  route's loading screen can draw it without pulling the feature's data modules. */
export function FqAroundYouFrame() {
  return (
    <section className="ay" aria-busy="true" aria-label="Loading what is around you">
      <div className="ay-top">
        <div className="ay-spot">
          <span className="ay-spot-cover" />
          <div className="ay-spot-b">
            <span className="ev-skel-bar w30" />
            <span className="ev-skel-bar tall w60" />
            <span className="ev-skel-bar w45" />
          </div>
        </div>
        <span className="evm-tile" />
      </div>
    </section>
  )
}

export function FqEventsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading events">
      <div className="ev-hero is-plain">
        <div className="ev-hero-in">
          <span className="ev-skel-bar w30" />
          <span className="ev-skel-bar tall w60" />
          <span className="ev-skel-bar w45" />
        </div>
      </div>
      <FqAroundYouFrame />
      <div className="ev-tb">
        <span className="ev-search" />
      </div>
      <div className="ev-list ev-list3">
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
