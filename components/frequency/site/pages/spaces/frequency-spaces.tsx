// THE SPACES PAGE BODY under the Frequency design: templates/website/Spaces.html, section by section, in
// the "site" kit's markup. Served at /spaces.
//
// The shell lane owns the kit root, header, footer and FX layer. This body pins its own side to Spaces
// (`data-pa-side="e"`, the design's `data-lock="e"`), so the sun side colour holds whatever the visitor
// last chose on Home.
//
// Sample data replaced: the hero pill's "San Diego" and the "On the map" ranking read the real directory
// in its STANDING order (../shared/data.ts), the same earned order /discover/spaces uses. The design's
// "Gathered 18 times this month" has no public figure behind it, so the pill shows the Space's upcoming
// gatherings when it has any, else its kind. Copy is the design's, verbatim.
//
// THE HYBRID: one section the design lacks is kept from the DAWN page, the four builder guides, restyled
// as the design's feature cards. The questions carry FAQPage JSON-LD. Motion is the shell's FX loop and
// the closing band is the shell's <KeepGoing>.

import '@/app/themes/frequency/site-pages-a.css'
import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { getRankedSpaces } from '../shared/data'
import { feature, SITE } from '../shared/links'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { JsonLd } from '@/components/json-ld'
import { faqSchema } from '@/lib/jsonld'
import { Acts, aura, ChapPhoto, Chapter, LocPill, photo, WhatsOnList } from '../shared/parts'

const TYPES: { icon: FqIconName; kind: string; line: string }[] = [
  { icon: 'breath', kind: 'Studios', line: 'Fill the 7pm class.' },
  { icon: 'contacts', kind: 'Coaches + practitioners', line: 'A client list you keep.' },
  { icon: 'ticket', kind: 'Event hosts', line: 'A guest list that comes back.' },
  { icon: 'space', kind: 'Cafés + venues', line: 'Your slow night, full.' },
  { icon: 'gem', kind: 'Non-profits', line: 'Every tool, nothing taken.' },
]

const FEATURES: { id: string; icon: FqIconName; title: string; body: string }[] = [
  { id: 'f-page', icon: 'page', title: 'Your page', body: 'A page for your Space you change yourself.' },
  { id: 'f-standing', icon: 'standing', title: 'Standing', body: 'Placement earned by gathering, never sold.' },
  { id: 'f-circles-s', icon: 'circle', title: 'Circles', body: 'Your steady place.' },
  { id: 'f-events-s', icon: 'ticket', title: 'Events', body: 'Post a one-off to the town calendar.' },
  { id: 'f-doorqr', icon: 'qr', title: 'Door QR', body: 'One code for every experience you run.' },
  { id: 'f-contacts', icon: 'contacts', title: 'Contacts', body: 'Who came, who’s new, who hasn’t been back.' },
  { id: 'f-firsttimers', icon: 'nudge', title: 'First-timer nudges', body: 'A heads-up while they’re still in the room.' },
  { id: 'f-programs-s', icon: 'program', title: 'Programs', body: 'A path your Circle walks together.' },
]

/** Kept from the DAWN page (lib/page-editor/templates/spaces.ts, "Guides for builders"): the builder
 *  guides that make /spaces the hub of that cluster. Not in the design; restyled as its feature cards. */
const GUIDES: { href: string; icon: FqIconName; title: string; body: string }[] = [
  { href: '/loneliness', icon: 'space', title: 'What a third space is', body: 'The definition, why they got rare, and how to build one today.' },
  { href: '/how-to-build-community', icon: 'circle', title: 'How to run a community space', body: 'The operator playbook: a rhythm, a room, a few regulars, light tooling.' },
  { href: '/tools-for-community-builders', icon: 'page', title: 'Tools for community builders', body: 'The four jobs a builder needs, and how one Space covers them.' },
  { href: '/how-to-start-a-circle', icon: 'host', title: 'How to start a Circle', body: 'Pick one thing, set a standing time, invite a few people, keep the format simple.' },
]

const QUESTIONS: [string, string][] = [
  ['Another tool?', 'It replaces the six you’re juggling: calendar, door list, contacts, email, tickets and memberships.'],
  ['What does it cost?', 'Nothing until you charge. Your regulars are 0%, plus card processing. When someone we bring you buys, we take a small share.'],
  ['Will you sell my members?', 'Never. Your contacts are yours.'],
  ['How do I rank higher?', 'Gather more often. Standing comes from how often you meet and who’s in the room, never from money.'],
]

export async function FrequencySpaces() {
  const ranked = await getRankedSpaces(6)
  return (
    <div className="pa-page pa-spaces" data-pa-side="e" data-motion-scope style={{ display: 'contents' }}>
      <section className="phero big" data-energy="charge" data-screen-label="01 Hero">
        <div className="bg" style={{ backgroundImage: `url('${photo('gathering-09.jpg')}')` }} />
        <div className="fq-aura" style={aura(0.3)} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span>For spaces</span>
          </nav>
          <LocPill href="#map" city={ranked.city} line="Ranked by gathering, never by who paid" />
          <h1 className="h-xl">
            You’ve built a community. <em className="fq-iri-text">Let the people looking for one find it.</em>
          </h1>
          <p>
            Every Circle, event and program you run is an experience. Frequency puts them on the calendar your town
            reads, remembers who came, and gives them a reason to come back.
          </p>
          <div className="ctas">
            <Link className="btn fq-iri-btn" href={SITE.join}>
              Open your Space
            </Link>
            <Link className="btn btn-ghost fq-iri-rim" href={SITE.people}>
              I’m looking for a community →
            </Link>
          </div>
        </div>
      </section>

      <section className="sec" style={{ paddingBottom: 0 }} data-screen-label="02 Your path">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Your path</b>Four steps
            </div>
            <h2 className="h-l">From an empty Tuesday to a full one.</h2>
          </div>
        </div>

        <Chapter label="02a Be found">
          <div>
            <span className="n">01 · Be found</span>
            <h2 className="h-l">Land where your town looks.</h2>
            <p className="body-l">
              Open a Space for free and post what you run. It lands on the calendar your whole town reads, ranked by
              how often you gather, never by who paid.
            </p>
            <Acts
              items={[
                { href: feature('f-page'), icon: 'page', title: 'Set up your page', sub: 'Change it yourself, anytime' },
                { href: feature('f-events-s'), icon: 'event', title: 'Post your first experience', sub: 'A Circle, an event or a program' },
              ]}
            />
          </div>
          <ChapPhoto sheen src={photo('gathering-04.jpg')} alt="A Space set up for guests" />
        </Chapter>

        <Chapter label="02b Open the door" rev>
          <ChapPhoto src={photo('gathering-07.jpg')} alt="Guests arriving at a venue" />
          <div>
            <span className="n">02 · Open the door</span>
            <h2 className="h-l">Know who came.</h2>
            <p className="body-l">
              One QR at the door remembers everyone who walked in. First-timers get flagged, so you can say hi before
              they slip out.
            </p>
            <Acts
              items={[
                { href: feature('f-doorqr'), icon: 'qr', title: 'Print your door QR', sub: 'One code for every experience' },
                { href: feature('f-firsttimers'), icon: 'nudge', title: 'Greet first-timers', sub: 'Nudges while they’re in the room' },
              ]}
            />
          </div>
        </Chapter>

        <Chapter label="02c Bring them back">
          <div>
            <span className="n">03 · Bring them back</span>
            <h2 className="h-l">Give them a rhythm.</h2>
            <p className="body-l">
              Ongoing Circles, programs people move through together, memberships that drop them straight into their
              group.
            </p>
            <Acts
              items={[
                { href: feature('f-programs-s'), icon: 'program', title: 'Build a program', sub: 'A path your Circle walks together' },
                { href: feature('f-memberships'), icon: 'membership', title: 'Sell memberships', sub: 'Members land in their Circle' },
              ]}
            />
          </div>
          <ChapPhoto sheen src={photo('gathering-09.jpg')} alt="A regular group mid-session" />
        </Chapter>

        <Chapter label="02d Grow" rev>
          <ChapPhoto src={photo('night-yoga-rave-web.jpg')} alt="A full room at night" />
          <div>
            <span className="n">04 · Grow</span>
            <h2 className="h-l">Rise by how often you gather.</h2>
            <p className="body-l">
              Your standing climbs every time your community meets. Hand a Circle to a regular and you’re running two
              experiences.
            </p>
            <Acts
              items={[
                { href: feature('f-standing'), icon: 'standing', title: 'How standing works', sub: 'Earned, never bought' },
                { href: SITE.pricing, icon: 'tip', title: 'See pricing', sub: '0% on your regulars, plus card processing' },
              ]}
            />
          </div>
        </Chapter>
      </section>

      <section className="sec" id="map" data-screen-label="02x On the map">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>On the map</b>Standing, not ads
            </div>
            <h2 className="h-l">Where your town looks for something to do.</h2>
          </div>
          <WhatsOnList
            mode="spaces"
            title={ranked.city ? `Spaces near you in ${ranked.city}` : 'Spaces on Frequency'}
            spaces={ranked.spaces}
            ok={ranked.ok}
            emptyHref={SITE.join}
            style={{ height: 'min(620px,78vh)' }}
          />
          <p className="body-l" style={{ marginTop: 20 }}>
            Spaces are ranked by how often they gather and who’s in the room. Nobody can pay their way up.
          </p>
        </div>
      </section>

      <section className="sec" id="types" data-screen-label="03 For your type">
        <div className="fq-aura" style={aura(0.22)} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>For your type</b>Five kinds of Space
            </div>
            <h2 className="h-l">Built for the way you already gather.</h2>
          </div>
          <div className="g5">
            {TYPES.map((t) => (
              <div className="pop" key={t.kind}>
                <span className="pglow" />
                <article className="pc">
                  <span className="ic">
                    <FqIcon name={t.icon} />
                  </span>
                  <span className="v">{t.kind}</span>
                  <h3>{t.line}</h3>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }} data-screen-label="Features">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Features</b>What you get
            </div>
            <h2 className="h-l">Everything you need to run it.</h2>
          </div>
          <div className="g4f">
            {FEATURES.map((f) => (
              <Link className="pop" key={f.id} href={feature(f.id)}>
                <span className="pglow" />
                <span className="pc">
                  <span className="ic">
                    <FqIcon name={f.icon} />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </span>
              </Link>
            ))}
          </div>
          <p style={{ margin: '24px 0 0' }}>
            <Link className="btn btn-ghost fq-iri-rim" href={feature('spaces')}>
              See all features →
            </Link>
          </p>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }} data-screen-label="05 Questions">
        <div className="fq-aura" style={aura(0.22)} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Questions</b>The ones owners ask
            </div>
            <h2 className="h-l">Before you open.</h2>
          </div>
          <JsonLd data={faqSchema(QUESTIONS.map(([q, a]) => ({ q, a })))} />
          <div className="qa">
            {QUESTIONS.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }} id="guides" data-screen-label="05x Guides">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Guides for builders</b>Free to read
            </div>
            <h2 className="h-l">How to build a third space.</h2>
          </div>
          <div className="g4f">
            {GUIDES.map((g) => (
              <Link className="pop" key={g.href} href={g.href}>
                <span className="pglow" />
                <span className="pc">
                  <span className="ic">
                    <FqIcon name={g.icon} />
                  </span>
                  <h3>{g.title}</h3>
                  <p>{g.body}</p>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <KeepGoing
        title="Open your Space. It’s free."
        body="It takes a few minutes, and you pay nothing until you charge."
        primary={{ href: SITE.join, label: 'Open your Space →' }}
        secondary={{ href: SITE.pricing, label: 'See pricing' }}
      />
    </div>
  )
}
