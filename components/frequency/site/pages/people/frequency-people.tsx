// THE PEOPLE PAGE BODY under the Frequency design: templates/website/People.html, section by section,
// in the "site" kit's markup. Served at /the-community (see ../shared/links.ts for why not /people).
//
// The shell lane owns the kit root (`[data-kit="site"]`), the header, the footer and the FX layer. This
// body pins its own side to People (`data-pa-side="p"`, the design's `data-lock="p"`), so the aqua side
// colour holds even when the visitor last chose Host Community on Home.
//
// Sample data replaced: the hero pill's "San Diego · 48 Circles and events this week" and the
// "What's happening near you" map read the real calendar (../shared/data.ts). Copy is the design's,
// verbatim (guidelines/messaging.md: final copy), except where messaging.md overrules the prototype: the
// calendar feature is "What's happening", not "Your town's calendar".
//
// Motion (pop-in reveals, parallax, the hero lift) is the shell's FX loop; the closing band is the
// shell's <KeepGoing>. The questions carry FAQPage JSON-LD, as the DAWN body's accordion does.

import '@/app/themes/frequency/site-pages-a.css'
import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { getWhatsOn } from '../shared/data'
import { feature, SITE } from '../shared/links'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { JsonLd } from '@/components/json-ld'
import { faqSchema } from '@/lib/jsonld'
import { Acts, aura, ChapPhoto, Chapter, LocPill, photo, WhatsOnList } from '../shared/parts'

const FIRST_NIGHT: { icon: FqIconName; title: string; body: string }[] = [
  { icon: 'host', title: 'The Host at the door', body: 'Someone is there to say hi and tell you where to put your things.' },
  { icon: 'contacts', title: 'Faces, not a crowd', body: 'Circles are small. You’ll learn names in the first ten minutes.' },
  { icon: 'event', title: 'About an hour', body: 'Most Circles run an hour or so. Stay after if you like.' },
]

const FEATURES: { id: string; icon: FqIconName; title: string; body: string }[] = [
  { id: 'f-calendar', icon: 'event', title: 'What’s happening', body: 'Everything meeting near you this week, in one place.' },
  { id: 'f-circles', icon: 'circle', title: 'Circles', body: 'Small groups around one thing, with familiar faces when you return.' },
  { id: 'f-events', icon: 'ticket', title: 'Events', body: 'One-off gatherings worth going out for.' },
  { id: 'f-programs', icon: 'program', title: 'Programs', body: 'A few weeks with the same group, start to finish.' },
  { id: 'f-checkin', icon: 'checkin', title: 'Check-in', body: 'Scan at the door and you’re in.' },
  { id: 'f-reminders', icon: 'nudge', title: 'Reminders', body: 'A nudge before your Circle or event.' },
  { id: 'f-zaps', icon: 'zap', title: 'Zaps', body: 'Points for real-world acts, nothing else.' },
  { id: 'f-seasons', icon: 'event', title: 'Seasons', body: 'Thirteen weeks, then a fresh start.' },
]

const QUESTIONS: [string, string][] = [
  ['I don’t know anyone.', 'That’s most people on their first night. Circles are small on purpose, and the Host will introduce you.'],
  ['I’m not spiritual.', 'You don’t need to be. Circles run around anything: moving, making, eating, sitting still, going out.'],
  ['I’m not fit.', 'Plenty of Circles don’t involve exercise at all. The ones that do say so up front.'],
  ['Is it free?', 'Yes. Joining, checking in, playing and hosting are free. Some Spaces sell tickets or memberships, and that money goes to them.'],
]

export async function FrequencyPeople() {
  const on = await getWhatsOn(12)
  const weekLine = on.thisWeek > 0 ? `${on.thisWeek} ${on.thisWeek === 1 ? 'event' : 'events'} this week` : null
  return (
    <div className="pa-page pa-people" data-pa-side="p" data-motion-scope style={{ display: 'contents' }}>
      <section className="phero big" data-energy="charge" data-screen-label="01 Hero">
        <div className="bg" style={{ backgroundImage: `url('${photo('day-meditation-circle.jpg')}')` }} />
        <div className="fq-aura" style={aura(0.3)} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span>For people</span>
          </nav>
          <LocPill href="#near" city={on.city} line={weekLine} />
          <h1 className="h-xl">
            A hundred contacts. <em className="fq-iri-text">No one to call on a Tuesday.</em>
          </h1>
          <p>
            Frequency is where you find the people near you, and keep finding them, around something you like
            doing. Free to join, and built to get you off your phone.
          </p>
          <div className="ctas">
            <a className="btn fq-iri-btn" href="#near">
              Find your Circle
            </a>
            <Link className="btn btn-ghost fq-iri-rim" href={SITE.spaces}>
              I run a Space →
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
            <h2 className="h-l">From a stranger to a regular.</h2>
          </div>
        </div>

        <Chapter label="02a Find">
          <div>
            <span className="n">01 · Find</span>
            <h2 className="h-l">See what’s happening near you.</h2>
            <p className="body-l">
              One calendar for your town. Circles you can keep coming back to, events, programs, experiences. Pick
              something you like doing and a time you’re free.
            </p>
            <Acts
              items={[
                { href: '#near', icon: 'pin', title: 'Set your town', sub: 'See what meets near you' },
                { href: '#near', icon: 'circle', title: 'Pick a Circle', sub: 'Same people, same time' },
              ]}
            />
          </div>
          <div className="chap-map">
            <WhatsOnList
              mode="people"
              title={on.city ? `This week in ${on.city}` : 'Coming up'}
              events={on.events.slice(0, 6)}
              ok={on.ok}
              emptyHref={SITE.spaces}
            />
          </div>
        </Chapter>

        <Chapter label="02b Show up" rev>
          <ChapPhoto src={photo('day-parachute-play.jpg')} alt="Adults playing with a parachute" />
          <div>
            <span className="n">02 · Show up</span>
            <h2 className="h-l">Walk in. Check in.</h2>
            <p className="body-l">Scan at the door and you’re counted. Being in the room is the only thing that earns Zaps here.</p>
            <Acts
              items={[
                { href: '#first-night', icon: 'ticket', title: 'Your first night', sub: 'What to expect' },
                { href: feature('f-zaps'), icon: 'checkin', title: 'Why check-in counts', sub: '+25 Zaps for being there' },
              ]}
            />
          </div>
        </Chapter>

        <Chapter label="02c Come back">
          <div>
            <span className="n">03 · Come back</span>
            <h2 className="h-l">Same people, same time.</h2>
            <p className="body-l">
              Keep coming and the faces start to know yours. One week you’re new, a month later someone saves you a
              spot.
            </p>
            <Acts items={[{ href: feature('f-zaps'), icon: 'zap', title: 'Play the season', sub: 'Zaps for showing up again' }]} />
          </div>
          <ChapPhoto sheen src={photo('day-meditation-circle.jpg')} alt="A circle of people outdoors" />
        </Chapter>

        <Chapter label="02d Pass it on" rev>
          <ChapPhoto src={photo('day-beach-hoop.jpg')} alt="Someone dancing on the beach" />
          <div>
            <span className="n">04 · Pass it on</span>
            <h2 className="h-l">Bring someone. Then host.</h2>
            <p className="body-l">
              Keep coming and someone will ask you to host. That’s how a town gets a scene it didn’t have last year.
            </p>
            <Acts
              items={[
                { href: SITE.spaces, icon: 'host', title: 'Host an experience', sub: 'Your living room counts' },
                { href: SITE.stories, icon: 'message', title: 'Host stories', sub: 'Regulars who became Hosts' },
              ]}
            />
          </div>
        </Chapter>
      </section>

      <section className="sec" id="first-night" data-screen-label="03 Your first night">
        <div className="fq-aura" style={aura(0.22)} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Your first night</b>No surprises
            </div>
            <h2 className="h-l">What it’s actually like.</h2>
          </div>
          <div className="g3">
            {FIRST_NIGHT.map((c) => (
              <div className="pop" key={c.title}>
                <span className="pglow" />
                <article className="pc">
                  <span className="ic">
                    <FqIcon name={c.icon} />
                  </span>
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="near" style={{ paddingTop: 0 }} data-screen-label="04 Near you">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>What’s happening near you</b>
              {on.city ? `${on.city} · this week` : 'This week'}
            </div>
            <h2 className="h-l">Things to do this week, with other people.</h2>
          </div>
          <WhatsOnList
            mode="people"
            title={on.city ? `This week in ${on.city}` : 'Coming up'}
            events={on.events}
            ok={on.ok}
            emptyHref={SITE.spaces}
            style={{ height: 'min(680px,80vh)' }}
          />
          <div className="ctas" style={{ marginTop: 20 }}>
            <Link className="btn fq-iri-btn" href={SITE.join}>
              Set your town
            </Link>
            <a className="btn btn-ghost fq-iri-rim" href="#first-night">
              What to expect on your first night
            </a>
          </div>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }} data-screen-label="Features">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Features</b>What you get
            </div>
            <h2 className="h-l">Everything you need to show up.</h2>
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
            <Link className="btn btn-ghost fq-iri-rim" href={feature('people')}>
              See all features →
            </Link>
          </p>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }} data-screen-label="06 Questions">
        <div className="fq-aura" style={aura(0.22)} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Questions</b>The ones everyone asks
            </div>
            <h2 className="h-l">You’re not the only one wondering.</h2>
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

      <KeepGoing
        title="Find your first Circle."
        body="The nearest one might meet this week."
        primary={{ href: SITE.peopleNear, label: 'Find your Circle →' }}
        secondary={{ href: feature('people'), label: 'See every feature' }}
      />
    </div>
  )
}
