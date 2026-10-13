// The /stories BODY on the Frequency design (templates/website/Stories.html). The shell lane owns the
// kit root, header, footer, FX and side state.
//
// 🔴 NO INVENTED PEOPLE. The reference fills its grid with four sample stories ("From first-timer to
// Host", "One studio, four communities", ...). Nothing in the product stores a member's or a Space's
// story yet, so the grid is the reference's section with an honest empty state in place of the cards.
// When a real source exists, its cards drop into the `.fg` grid in the reference's `.pop > .pc` shape.
import Link from 'next/link'
import '@/app/themes/frequency/site-pages-b.css'
import { CONTACT_EMAIL } from '@/lib/site'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

export function FrequencyStories() {
  return (
    <>
      <section className="phero big" data-energy="charge" data-screen-label="01 Hero">
        <div className="bg" style={{ backgroundImage: "url('/brand/frequency/photos/day-parachute-play.jpg')" }} />
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.3 })} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <div className="crumbs">
            <Link href="/">Home</Link>
            <span>/</span>
            <span>Stories</span>
          </div>
          <h1 className="h-xl">
            Hosts and Spaces, <em className="fq-iri-text">in their own words.</em>
          </h1>
          <p>Every story ends in a community you can join.</p>
          <div className="ctas">
            <Link className="btn fq-iri-btn" href="/discover/circles">
              Find your Circle
            </Link>
            <Link className="btn btn-ghost fq-iri-rim" href="/spaces">
              Open your Space
            </Link>
          </div>
        </div>
      </section>

      <section className="sec" data-screen-label="02 Stories">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Stories</b>Hosts and Spaces
            </div>
            <h2 className="h-l">The first stories are being written now.</h2>
          </div>
          <div className="pb-empty">
            <h3>No stories here yet.</h3>
            <p>
              We only publish stories from real Hosts and Spaces, told in their own words, with photos from their
              rooms. Each one will end with a way in: their Circle to join, or their Space to visit.
            </p>
            <p>Host a Circle or run a Space on Frequency? Tell us how it started.</p>
            <div className="ctas">
              <a className="btn fq-iri-btn" href={`mailto:${CONTACT_EMAIL}?subject=My%20Frequency%20story`}>
                Tell us your story
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="sec kg" data-screen-label="03 Keep going">
        <div className="wrap">
          <div className="next2" data-energy="charge">
            <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.55 })} />
            <span className="rings" aria-hidden="true" />
            <div className="n2t">
              <span className="k">Keep going</span>
              <h3>Find your community.</h3>
              <p>Or open a Space for yours.</p>
            </div>
            <div className="ctas">
              <Link className="btn fq-iri-btn" href="/discover/circles">
                Find your Circle →
              </Link>
              <Link className="btn btn-ghost fq-iri-rim" href="/spaces">
                Open your Space
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
