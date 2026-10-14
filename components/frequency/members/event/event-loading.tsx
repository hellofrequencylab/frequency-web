import '@/app/themes/frequency/members-b.css'
import '@/app/themes/frequency/members-events.css'

// THE EVENT PAGE'S WAIT, UNDER FREQUENCY: the split hero card of templates/members/Event.html (photo
// left, words right) and the About / Host columns under it, so the page lands without a jump. The
// DAWN skeleton composes EventDetailTemplate, a different shape, which is why this exists.

export function FqEventLoading() {
  return (
    <div aria-busy="true" aria-label="Loading event">
      <span className="ev-skel-bar w30" />
      <section className="card fqm-ev">
        <div className="ph fqm-ev-ph" />
        <div className="fqm-ev-in">
          <span className="ev-skel-bar w30" />
          <span className="ev-skel-bar tall w60" />
          <span className="ev-skel-bar w45" />
          <span className="ev-skel-bar w30" />
        </div>
      </section>
      <div className="ap-cols sec">
        <div className="stack fqm-secs">
          <span className="ev-skel-bar tall w30" />
          <span className="ev-skel-bar w60" />
          <span className="ev-skel-bar w45" />
        </div>
        <aside className="side">
          <div className="panel stack">
            <span className="ev-skel-bar w30" />
            <span className="ev-skel-bar w60" />
          </div>
        </aside>
      </div>
    </div>
  )
}
