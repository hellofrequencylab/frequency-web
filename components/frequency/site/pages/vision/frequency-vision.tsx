// The /vision BODY on the Frequency design (templates/website/Vision.html): third spaces, for partners,
// investors, civic leaders and press. The shell lane owns the kit root, header, footer and FX.
//
// 🔴 FUTURE TENSE (ADR-1735, LIVE-912). The Lab is a plan, not a place: nothing is bookable and the
// first one is planned to open in 2028. The reference dates the vision "late 2027"; the product's own
// pages (/the-lab, What is Frequency, llms.txt) date it 2028, and the code wins, so this page says 2028.
// The reference's three placeholder chips ("Density map", "Partner form") stood in for widgets that do
// not exist; they are replaced by real doors (The Lab plan, the Help contact band).
import Link from 'next/link'
import '@/app/themes/frequency/site-pages-b.css'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

export function FrequencyVision() {
  return (
    <>
      <section className="phero" data-energy="flow" data-screen-label="01 Hero">
        <div className="bg" style={{ backgroundImage: "url('/brand/frequency/facilities/hall-stage-night.jpg')" }} />
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.3 })} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <div className="crumbs">
            <Link href="/">Home</Link>
            <span>/</span>
            <span>Frequency</span>
          </div>
          <span className="wingtag">Frequency</span>
          <h1 className="h-xl" style={{ marginTop: 18 }}>
            When a community is ready, <em className="fq-iri-text">it earns a home.</em>
          </h1>
          <p>
            For partners, investors, civic leaders and press. The vision for Frequency third spaces: the first is
            planned to open in 2028, and nothing is bookable yet.
          </p>
          <div className="ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link className="btn fq-iri-btn" href="/help#contact">
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      <section className="sec" data-energy="flow" data-screen-label="02 Content">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.25 })} />
        <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="blocks">
            <div className="block wide">
              <span className="wingtag">The density story</span>
              <h3>The density story</h3>
              <p>
                The network finds the people. The people find each other. When a town’s communities are dense
                enough, they will earn a home of their own.
              </p>
            </div>
            <div className="block">
              <span className="wingtag">Concepts</span>
              <h3>Concepts</h3>
              <p>Facility concepts, always labeled Vision · 2028. The first Lab is a plan, not a place.</p>
              <div className="feats">
                <i>Vision · 2028</i>
              </div>
              <p>
                <Link href="/the-lab">See the plan for The Lab →</Link>
              </p>
            </div>
            <div className="block">
              <span className="wingtag">Partner with us</span>
              <h3>Partner with us</h3>
              <p>Tell us about your town or your building.</p>
              <p>
                <Link href="/help#contact">Write to us →</Link>
              </p>
            </div>
          </div>
          <div className="next fq-iri-rim" data-energy="charge">
            <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.35 })} />
            <div>
              <span className="k">Keep going</span>
              <h3>Back to today</h3>
              <p style={{ margin: '10px 0 0', fontSize: 16 }}>Frequency works in Community Spaces now.</p>
            </div>
            <Link className="btn fq-iri-btn" href="/">
              Back to today →
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
