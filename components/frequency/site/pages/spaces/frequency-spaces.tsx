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
//
// THE SHOWCASE (owner 2026-11-04, "make each a different layout that speaks to the service"): the path is
// four full-bleed photo chapters with the words on glass; the first one shows a Space page in a real
// theme (the Nocturne kit renders in public/themes/midnight, the same pictures the theme page shows); the
// five kinds of Space are photo cards on a scroll-snap rail; the features read as a tool sheet. Layout
// styles: .pa-show in site-pages-showcase.css.

import '@/app/themes/active/site-pages-a'
import '@/app/themes/active/site-pages-showcase'
import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { getRankedSpaces } from '../shared/data'
import { feature, SITE } from '../shared/links'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { JsonLd } from '@/components/json-ld'
import { faqSchema } from '@/lib/jsonld'
import { themePagePath } from '@/lib/themes/library'
import { Acts, type Act, aura, LocPill, photo, photoBg, photoImg, WhatsOnList } from '../shared/parts'

/** Each kind links to its door (SCAN-1017): under the Frequency design nothing else on the site reached
 *  the /for pages. Venues have no door of their own, so their card opens the Spaces directory. */
const TYPES: { icon: FqIconName; kind: string; line: string; href: string; photo: string; alt: string }[] = [
  { icon: 'breath', kind: 'Studios', line: 'Share your next class.', href: '/for/studios', photo: photo('gathering-05.jpg'), alt: 'A full outdoor class on a lawn between houses' },
  { icon: 'contacts', kind: 'Coaches + practitioners', line: 'A client list you keep.', href: '/for/coaches-and-healers', photo: '/images/site/sound-healing.jpg', alt: 'A practitioner smiling among singing bowls on the sand' },
  { icon: 'ticket', kind: 'Event hosts', line: 'Invite guests to the next date.', href: '/for/event-hosts', photo: '/brand/frequency/broll/yoga-rave-glowsticks-web.jpg', alt: 'A crowd with glowsticks at a night event' },
  { icon: 'space', kind: 'Cafés + venues', line: 'A place for local groups to meet.', href: '/discover/spaces', photo: '/images/site/community-dinner.jpg', alt: 'Friends sharing a dinner on a patio under heaters' },
  { icon: 'gem', kind: 'Non Profits', line: 'Supporters, programs and donations.', href: '/for/nonprofits', photo: '/images/site/group-of-friends.jpg', alt: 'A group posing together after a community session' },
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

/** One full-bleed photo chapter: the photo fills the band, the words sit on glass on one side. */
function ShowChapter({
  label,
  n,
  title,
  body,
  acts,
  src,
  alt,
  rev,
  aside,
}: {
  label: string
  n: string
  title: string
  body: string
  acts: Act[]
  src: string
  alt: string
  rev?: boolean
  aside?: React.ReactNode
}) {
  return (
    <div className={rev ? 'show-ch rev' : 'show-ch'} data-screen-label={label}>
      <div className="show-ph">
        {/* eslint-disable-next-line @next/next/no-img-element -- the band sizes its own img (object-fit cover) */}
        <img loading="lazy" decoding="async" {...photoImg(src, '100vw')} alt={alt} />
        <span className="show-scrim" />
        <span className="fq-grain" />
      </div>
      <div className="wrap show-in">
        <div className="show-panel fq-panel fq-iri-rim">
          <span className="n">{n}</span>
          <h2 className="h-l">{title}</h2>
          <p className="body-l">{body}</p>
          <Acts items={acts} />
        </div>
        {aside}
      </div>
    </div>
  )
}

/** A Space page in a real theme: the Nocturne kit's website and Spotlight renders, in the design system's
 *  browser frame and iPhone 390 by 844 frame. Pictures that already ship on the theme page; nothing drawn. */
function ThemePreview() {
  return (
    <figure className="show-prev">
      <div className="show-dv">
        <div className="show-bar" aria-hidden="true">
          <i />
          <i />
          <i />
          <u>yourstudio.com</u>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- sized by the frame */}
        <img loading="lazy" decoding="async" {...photoImg('/themes/midnight/shots/studios-site.jpg', '(max-width: 860px) 90vw, 40vw')} alt="A studio’s website in the Nocturne theme" />
      </div>
      <div className="show-ios" aria-hidden="true">
        <div className="show-ios-scr">
          {/* eslint-disable-next-line @next/next/no-img-element -- sized by the frame */}
          <img loading="lazy" decoding="async" {...photoImg('/themes/midnight/shots/studios-spot.jpg', '(max-width: 860px) 40vw, 16vw')} alt="" />
        </div>
      </div>
      <figcaption>
        <Link href={themePagePath('midnight')}>Nocturne theme →</Link>
      </figcaption>
    </figure>
  )
}

export async function FrequencySpaces() {
  const ranked = await getRankedSpaces(6)
  return (
    <div className="pa-page pa-spaces pa-show" data-pa-side="e" data-motion-scope style={{ display: 'contents' }}>
      <section className="phero big" data-energy="charge" data-screen-label="01 Hero">
        <div className="bg" style={photoBg(photo('night-string-lights-web.jpg'))} />
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
            <Link className="btn fq-iri-btn" href={SITE.createSpace}>
              Open your Space
            </Link>
            <Link className="btn btn-ghost fq-iri-rim" href={SITE.people}>
              I’m looking for a community →
            </Link>
          </div>
        </div>
      </section>

      <section className="sec show-path" data-screen-label="02 Your path">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Your path</b>Four steps
            </div>
            <h2 className="h-l">Build community around the next gathering.</h2>
          </div>
        </div>

        <ShowChapter
          label="02a Be found"
          n="01 · Be found"
          title="Help people find your next gathering."
          body="Open your Space and add your next gathering. People can find the date on the local calendar and visit your page to learn more."
          acts={[
            { href: feature('f-page'), icon: 'page', title: 'Set up your page', sub: 'Change it yourself, anytime' },
            { href: feature('f-events-s'), icon: 'event', title: 'Post your first experience', sub: 'A Circle, an event or a program' },
          ]}
          src={photo('gathering-04.jpg')}
          alt="A Space set up for guests on a garden lawn"
          aside={<ThemePreview />}
        />

        <ShowChapter
          label="02b Open the door"
          rev
          n="02 · Open the door"
          title="Know who came."
          body="Invite people to scan your QR code when they arrive. See who checked in and who is new, so you can welcome first-timers by name."
          acts={[
            { href: feature('f-doorqr'), icon: 'qr', title: 'Print your door QR', sub: 'One code for every experience' },
            { href: feature('f-firsttimers'), icon: 'nudge', title: 'Greet first-timers', sub: 'See eligible first-time check-ins' },
          ]}
          src={photo('gathering-02.jpg')}
          alt="Guests arriving at a beach gathering, arms up"
        />

        <ShowChapter
          label="02c Bring them back"
          n="03 · Bring them back"
          title="Give them a rhythm."
          body="Plan regular Circles and programs, or offer a recurring Space membership. Check the membership’s included benefits and linked Circle."
          acts={[
            { href: feature('f-programs-s'), icon: 'program', title: 'Build a program', sub: 'A path your Circle walks together' },
            { href: feature('f-memberships'), icon: 'membership', title: 'Sell memberships', sub: 'Set out membership benefits' },
          ]}
          src={photo('gathering-09.jpg')}
          alt="A regular group in a big hug mid-session"
        />

        <ShowChapter
          label="02d Grow"
          rev
          n="04 · Grow"
          title="Share the hosting with a regular."
          body="Invite a regular to host under your Space. Keep a way to see the gatherings you run together."
          acts={[
            { href: feature('f-standing'), icon: 'standing', title: 'How standing works', sub: 'Earned, never bought' },
            { href: SITE.pricing, icon: 'tip', title: 'See pricing', sub: '0% on your regulars, plus card processing' },
          ]}
          src={photo('night-yoga-rave-web.jpg')}
          alt="People gathering at night under pink light"
        />
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
            emptyHref={SITE.createSpace}
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
          <div className="g5 show-types">
            {TYPES.map((t) => (
              <Link className="pop" key={t.kind} href={t.href}>
                <span className="pglow" />
                <article className="pc">
                  <div className="ph">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes .pc .ph img itself (object-fit cover) */}
                    <img loading="lazy" decoding="async" {...photoImg(t.photo, '(max-width: 860px) 70vw, 20vw')} alt={t.alt} />
                    <span className="fq-grain" />
                  </div>
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

      <section className="sec sec-next show-kit" data-screen-label="Features">
        <span className="rings" aria-hidden="true" />
        <div className="fq-grain" />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Features</b>What you get
            </div>
            <h2 className="h-l">Everything you need to run it.</h2>
          </div>
          <div className="show-sheet fq-panel">
            {FEATURES.map((f) => (
              <Link key={f.id} href={feature(f.id)}>
                <span className="ic">
                  <FqIcon name={f.icon} />
                </span>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
                <span className="ar" aria-hidden="true">
                  →
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
        <div className="wrap show-qa">
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
        primary={{ href: SITE.createSpace, label: 'Open your Space →' }}
        secondary={{ href: SITE.pricing, label: 'See pricing' }}
      />
    </div>
  )
}
