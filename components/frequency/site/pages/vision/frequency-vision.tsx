// The /vision BODY on the Frequency design (templates/website/Vision.html): third spaces, for partners,
// investors, civic leaders and press. The shell lane owns the kit root, header ("Talk to us"), footer
// and FX.
//
// The reference: a hero, then three `.block`s (the density story, Concepts, Partner with us) whose
// bodies were placeholder chips ("Density map", "Vision · late 2027", "Partner form"), then the `.next`
// "Back to today" row. website-strategy.md names what those chips stand for: the density story, the
// facility concepts "always labeled Vision", and a partner interest form. This page builds all three:
//   • the density story as its three steps;
//   • the concepts as the facility renders (public/brand/frequency/facilities, which HANDOFF.md says are
//     "used on Vision only"), every one badged with the kit's `.concept` label;
//   • the partner form (partner-form.tsx), which opens the visitor's mail app: there is no intake endpoint.
//
// 🔴 FUTURE TENSE (ADR-1735, LIVE-912). The Lab is a plan, not a place: nothing is bookable and the
// first one is planned to open in 2028. The reference dates the vision "late 2027"; the product's own
// pages (What is Frequency, llms.txt) date it 2028, and the code wins, so this page says 2028.
// Every render is a concept, and the page says so under the gallery as well as on each image.
//
// THE LAB MERGED IN HERE (owner ruling 2026-10-14). /the-lab 301s to this page, so its dated plan
// (Now, 2027, 2028) and its five short answers live here now, with the FAQPage node they carried. The
// answers are the-lab's own, recovered verbatim except that "meeting weekly" is gone (no line promises
// a weekly cadence).
import Link from 'next/link'
import '@/app/themes/frequency/site-pages-b.css'
import { CONTACT_EMAIL, FOUNDING_PLACE } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { faqSchema } from '@/lib/jsonld'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { PartnerForm } from './partner-form'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

const VISION = 'Vision · 2028'

/** The facility concept renders, each with the room it imagines. Three rows of one wide and one narrow,
 *  alternating, on the three-column grid. */
const CONCEPTS: { file: string; room: string; alt: string; wide?: boolean }[] = [
  { file: 'hall-stage-night.jpg', room: 'The hall', alt: 'A concept render of a hall with a stage, lit for a night gathering', wide: true },
  { file: 'biophilic-lounge-day.jpg', room: 'The lounge by day', alt: 'A concept render of a planted lounge in daylight' },
  { file: 'lounge-cafe.jpg', room: 'The café', alt: 'A concept render of a lounge café' },
  { file: 'lobby-slat-wall.jpg', room: 'The lobby', alt: 'A concept render of a lobby with a dark slatted wall and a seating corner', wide: true },
  { file: 'thermal-circuit.jpg', room: 'The thermal circuit', alt: 'A concept render of warm plunge pools under a slatted wood ceiling' },
  { file: 'storefront-yoga.jpg', room: 'The storefront', alt: 'A concept render of a two-storey glass storefront on a city street at dusk', wide: true },
]

const DENSITY = [
  { step: '01', title: 'The network finds the people.', body: 'Circles and Events in Community Spaces that already exist: studios, cafés, living rooms and parks.' },
  { step: '02', title: 'The people find each other.', body: 'The same faces keep showing up, and the town’s communities start to know one another.' },
  { step: '03', title: 'The community earns a home.', body: 'When a town’s communities are dense enough, they will earn a third space of their own.' },
]

/** The dated plan, from the retired /the-lab page: the community first, the building second. */
const PLAN = [
  { step: 'Now', title: 'Circles, in borrowed rooms.', body: 'Circles meet in parks, living rooms and rented studios. The community is real; the building is not.' },
  { step: '2027', title: 'Site and permits.', body: `A shortlist in ${FOUNDING_PLACE}, then the slow part: a site, zoning, and the plumbing a sauna and a cold pool need.` },
  { step: '2028', title: 'The first Lab opens.', body: 'One building, built from day one to be repeatable. If the first room works, the second is a template, not an experiment.' },
]

/** The Lab's short answers, from the retired /the-lab page. They carry the FAQPage node below. */
export const LAB_QUESTIONS: { q: string; a: string }[] = [
  {
    q: 'What is The Lab?',
    a: `The Lab is a third space the Frequency community is building: not home, not work, a real room to move, warm up in the sauna, cool down in the plunge, and switch off in person. The first one is planned for 2028 in ${FOUNDING_PLACE}. It is not open yet.`,
  },
  {
    q: 'Can I visit The Lab yet?',
    a: 'Not yet, and nothing at The Lab is bookable. The first Lab is planned to open in 2028. Until then the community meets in rooms we borrow: parks, living rooms, and rented studios. You can join a Circle near you today.',
  },
  {
    q: 'What will be inside The Lab?',
    a: 'Movement studios, a cedar thermal circuit, a cold plunge pool, a no-alcohol connection bar, and a flexible events floor. One building, tuned room by room.',
  },
  {
    q: 'When will The Lab open?',
    a: 'The plan is dated: Circles meeting in borrowed rooms now, a site and permits through 2027, and the first Lab opening in 2028. There are no membership rates published because there is nothing to sell yet.',
  },
  {
    q: 'Where will the first Lab be?',
    a: `The first Lab is planned for ${FOUNDING_PLACE}, where the founding community is already meeting, and it is built to repeat in other cities once the community is there.`,
  },
]

export function FrequencyVision() {
  return (
    <>
      <section className="phero" data-energy="flow" data-screen-label="01 Hero">
        <div className="bg" style={{ backgroundImage: "url('/brand/frequency/facilities/hall-stage-night.jpg')" }} />
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.3 })} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Frequency</span>
          </nav>
          <span className="wingtag">Frequency</span>
          <h1 className="h-xl" style={{ marginTop: 18 }}>
            When a community is ready, <em className="fq-iri-text">it earns a home.</em>
          </h1>
          <p>
            For partners, investors, civic leaders and press. The vision for Frequency third spaces: the first is
            planned to open in 2028, and nothing is bookable yet.
          </p>
          <div className="ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a className="btn fq-iri-btn" href="#partner">
              Talk to us
            </a>
          </div>
        </div>
      </section>

      <section className="sec" id="density" data-energy="flow" data-screen-label="02 The density story">
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
              <ol className="vz-steps">
                {DENSITY.map((d) => (
                  <li key={d.step}>
                    <span className="vz-n">{d.step}</span>
                    <b>{d.title}</b>
                    <span>{d.body}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="block">
              <span className="wingtag">Concepts</span>
              <h3>Concepts</h3>
              <p>Facility concepts, always labeled {VISION}. The first Lab is a plan, not a place.</p>
              <div className="feats">
                <i>{VISION}</i>
              </div>
              <p>
                <a href="#concepts">See the concepts →</a>
              </p>
            </div>
            <div className="block">
              <span className="wingtag">Partner with us</span>
              <h3>Partner with us</h3>
              <p>Tell us about your town or your building.</p>
              <p>
                <a href="#partner">Write to us →</a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="concepts" style={{ paddingTop: 0 }} data-screen-label="03 Concepts">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Concepts</b>
              {VISION}
            </div>
            <h2 className="h-l">What a home could feel like.</h2>
            <p className="pb-note">
              These are concept renders, not photographs. No building exists yet, nothing is bookable, and every
              detail will change with the town that earns it.{' '}
              <a href="#plan">Read the plan for The Lab →</a>
            </p>
          </div>
          <div className="vz-g">
            {CONCEPTS.map((c) => (
              <figure key={c.file} className={c.wide ? 'vz-c wide' : 'vz-c'}>
                <div className="photo fq-iri-rim">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes .photo img itself (object-fit cover) */}
                  <img loading="lazy" decoding="async" src={`/brand/frequency/facilities/${c.file}`} alt={c.alt} />
                  <span className="concept">{VISION}</span>
                </div>
                <figcaption>{c.room}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="plan" style={{ paddingTop: 0 }} data-screen-label="04 The plan">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>The plan</b>Community first, building second
            </div>
            <h2 className="h-l">Where this actually is.</h2>
            <p className="pb-note">
              Most third places sign a lease, then go looking for the people. We’re doing it the other way round.
              There are no membership rates here because there’s nothing to sell yet. When there is, the price will
              be published before anybody is asked for a card.
            </p>
          </div>
          <ol className="vz-steps">
            {PLAN.map((p) => (
              <li key={p.step}>
                <span className="vz-n">{p.step}</span>
                <b>{p.title}</b>
                <span>{p.body}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec" id="questions" style={{ paddingTop: 0 }} data-screen-label="05 Questions">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Questions</b>The Lab
            </div>
            <h2 className="h-l">The short answers.</h2>
          </div>
          <JsonLd data={faqSchema(LAB_QUESTIONS)} />
          <div className="qa">
            {LAB_QUESTIONS.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="partner" style={{ paddingTop: 0 }} data-screen-label="06 Partner with us">
        <div className="wrap">
          <div className="band">
            <div>
              <span className="k">Partner with us</span>
              <h3>Tell us about your town or your building.</h3>
              <p>For partners, investors, civic leaders and press. A real person reads every note.</p>
            </div>
            <PartnerForm email={CONTACT_EMAIL} />
          </div>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }} data-screen-label="07 Back to today">
        <div className="wrap">
          <KeepGoing
            variant="row"
            title="Back to today"
            body="Frequency works in Community Spaces now."
            primary={{ href: '/', label: 'Back to today →' }}
          />
        </div>
      </section>
    </>
  )
}
