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

import '@/app/themes/active/site-pages-a'
import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { getRankedSpaces } from '../shared/data'
import { feature, SITE } from '../shared/links'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { JsonLd } from '@/components/json-ld'
import { faqSchema } from '@/lib/jsonld'
import { Acts, aura, ChapPhoto, Chapter, LocPill, photo, WhatsOnList } from '../shared/parts'

/** Each kind links to its door (SCAN-1017): under the Frequency design nothing else on the site reached
 *  the /for pages. Venues have no door of their own, so their card opens the Spaces directory. */
const TYPES: { icon: FqIconName; kind: string; line: string; href: string }[] = [
  { icon: 'breath', kind: 'Studios', line: 'Share your next class.', href: '/for/studios' },
  { icon: 'contacts', kind: 'Coaches + practitioners', line: 'A client list you keep.', href: '/for/coaches-and-healers' },
  { icon: 'ticket', kind: 'Event hosts', line: 'Invite guests to the next date.', href: '/for/event-hosts' },
  { icon: 'space', kind: 'Cafés + venues', line: 'A place for local groups to meet.', href: '/discover/spaces' },
  { icon: 'gem', kind: 'Non Profits', line: 'Supporters, programs and donations.', href: '/for/nonprofits' },
]

const FEATURES: { id: string; icon: FqIconName; title: string; body: string }[] = [
  { id: 'f-page', icon: 'page', title: 'Your page', body: 'A page for your Space you change yourself.' },
  { id: 'f-standing', icon: 'standing', title: 'Standing', body: 'Placement earned by gathering, never sold.' },
  { id: 'f-circles-s', icon: 'circle', title: 'Circles', body: 'Your steady place.' },
  { id: 'f-events-s', icon: 'ticket', title: 'Events', body: 'Post a one-off to the town calendar.' },
  { id: 'f-doorqr', icon: 'qr', title: 'Door QR', body: 'One code for every experience you run.' },
  { id: 'f-contacts', icon: 'contacts', title: 'Contacts', body: 'Who came, who’s new, who hasn’t been back.' },
  { id: 'f-firsttimers', icon: 'nudge', title: 'First-timer nudges', body: 'A notification after an eligible first check-in.' },
  { id: 'f-programs-s', icon: 'program', title: 'Programs', body: 'A path your Circle walks together.' },
]

/** Kept from the DAWN page (lib/page-editor/templates/spaces.ts, "Guides for builders"): the builder
 *  guides that make /spaces the hub of that cluster. Not in the design; restyled as its feature cards. */
const GUIDES: { href: string; icon: FqIconName; title: string; body: string }[] = [
  { href: '/loneliness', icon: 'space', title: 'What a third space is', body: 'The definition, why they got rare, and how to build one today.' },
  { href: '/how-to-build-community', icon: 'circle', title: 'How to run a community space', body: 'The operator playbook: a rhythm, a room, a few regulars, light tooling.' },
  { href: '/networks', icon: 'page', title: 'Run every chapter as one', body: 'For organizations with chapters: shared membership, one calendar and one report.' },
  { href: '/how-to-start-a-circle', icon: 'host', title: 'How to start a Circle', body: 'Pick one thing, set a standing time, invite a few people, keep the format simple.' },
]

const QUESTIONS: [string, string][] = [
  ['Another tool?', 'Your Space brings together your calendar, guest list, contacts and invitations. Paid options include tickets and memberships.'],
  ['What does it cost?', 'Hosting has free options within the published allowances. Selling starts at Business. Paid Space plans and introduction fees are separate. Your own bookings carry no network fee, plus card processing. Compare Collective for separate groups on the Pricing page. One organization with chapters takes Network.'],
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
            Give your community a place to find the next class, Circle or event. Share your dates on the local calendar and keep in touch with people who come.
          </p>
          <div className="ctas">
            <Link className="btn fq-iri-btn" href={SITE.join}>
              Join to open your Space
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
            <h2 className="h-l">Build community around the next gathering.</h2>
          </div>
        </div>

        <Chapter label="02a Be found">
          <div>
            <span className="n">01 · Be found</span>
            <h2 className="h-l">Help people find your next gathering.</h2>
            <p className="body-l">
              Open your Space and add your next gathering. People can find the date on the local calendar and visit your page to learn more.
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
              Invite people to scan your QR code when they arrive. See who checked in and who is new, so you can welcome first-timers by name.
            </p>
            <Acts
              items={[
                { href: feature('f-doorqr'), icon: 'qr', title: 'Print your door QR', sub: 'One code for every experience' },
                { href: feature('f-firsttimers'), icon: 'nudge', title: 'Greet first-timers', sub: 'See eligible first-time check-ins' },
              ]}
            />
          </div>
        </Chapter>

        <Chapter label="02c Bring them back">
          <div>
            <span className="n">03 · Bring them back</span>
            <h2 className="h-l">Give them a rhythm.</h2>
            <p className="body-l">
              Plan regular Circles and programs, or offer a recurring Space membership. Check the membership’s included benefits and linked Circle.
            </p>
            <Acts
              items={[
                { href: feature('f-programs-s'), icon: 'program', title: 'Build a program', sub: 'A path your Circle walks together' },
                { href: feature('f-memberships'), icon: 'membership', title: 'Sell memberships', sub: 'Set out membership benefits' },
              ]}
            />
          </div>
          <ChapPhoto sheen src={photo('gathering-09.jpg')} alt="A regular group mid-session" />
        </Chapter>

        <Chapter label="02d Grow" rev>
          <ChapPhoto src={photo('night-yoga-rave-web.jpg')} alt="People gathering at night" />
          <div>
            <span className="n">04 · Grow</span>
            <h2 className="h-l">Share the hosting with a regular.</h2>
            <p className="body-l">
              Invite a regular to host under your Space. Keep a way to see the gatherings you run together.
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
            <h2 className="h-l">Find Spaces sharing local gatherings.</h2>
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
              <Link className="pop" key={t.kind} href={t.href}>
                <span className="pglow" />
                <article className="pc">
                  <span className="ic">
                    <FqIcon name={t.icon} />
                  </span>
                  <span className="v">{t.kind}</span>
                  <h3>{t.line}</h3>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-next" data-screen-label="Features">
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

      <section className="sec sec-next" data-screen-label="05 Questions">
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

      <section className="sec sec-next" id="guides" data-screen-label="05x Guides">
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
        body="Start with your name and next gathering. See the plan details before you start charging."
        primary={{ href: SITE.join, label: 'Open your Space →' }}
        secondary={{ href: SITE.pricing, label: 'See pricing' }}
      />
    </div>
  )
}
