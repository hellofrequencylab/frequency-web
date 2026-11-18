// /courses/business-of-community under the Frequency design: the sales page for The Business of Community
// 101, Frequency's free four-week live workshop. Built from the approved design (owner 2026-11-18, the
// "The Business of Community 101 · Sales page" canvas, Public view), in the site kit's markup: kit buttons,
// .crumbs, .qa, the --fq- tokens. Layout styles: .pa-boc in site-pages-showcase.css. Server component,
// no request data, no client JS.
//
// Photos are Frequency's own gatherings (owner upload 2026-11-18), served through next/image (photoImg).
// The week titles are the workshop's own names (owner 2026-11-18): The Engine, The Container, The
// Gathering, The Exchange, each with its meeting under it. Every "Save your seat" opens the Week 1 event,
// where the RSVP lives (owner 2026-11-17: the button went to the calendar, not the event).
//
// The questions are BOC_FAQ (lib/page-editor/templates/business-of-community.ts), the same list the
// editor template carries, and they emit FAQPage JSON-LD here. Course and Breadcrumb come from the route.

import '@/app/themes/active/site-pages-a'
import '@/app/themes/active/site-pages-showcase'
import type { ReactNode } from 'react'
import Link from 'next/link'
import '@/app/themes/active/site-discover'
import { CourseLeadForm } from './course-lead-form'
import { JsonLd } from '@/components/json-ld'
import { faqSchema } from '@/lib/jsonld'
import { BOC_FAQ } from '@/lib/page-editor/templates/business-of-community'
import { aura, photo, photoImg } from '../shared/parts'

const EVENT = '/events/business-of-community-pilot-session-1'
const BUSINESS_HOURS = '/circles/business-hours'
const JOURNEY_SLUG = 'the-business-of-community-101'
const WEEK_ONE = `/courses/${JOURNEY_SLUG}/week-1`
const RUN_ICS = `/courses/${JOURNEY_SLUG}/calendar.ics`

const p = (name: string) => photo(`boc-${name}.jpg`)

type Shot = { src: string; alt: string; crop?: string }

const BAND: Shot[] = [
  { src: p('circle-arms-up'), alt: 'A circle on a seaside terrace, arms raised together' },
  { src: p('beach-yoga'), alt: 'A yoga class in tree pose on the beach' },
  { src: p('backyard-craft'), alt: 'Neighbors on rugs in a backyard, making things together' },
  { src: p('beach-sound-bath'), alt: 'A sound bath on the beach, people resting on blankets' },
  { src: p('beach-yoga-gull'), alt: 'A gull on the sand in front of a beach yoga class', crop: 'boc-crop-gull' },
]

const WHO = [
  'Run and hiking clubs',
  'Yoga and movement studios',
  'Book and supper clubs',
  'Meetups and networks',
  'Makers and art collectives',
  'Faith and service groups',
  'Neighborhood groups',
  'Music and open mic nights',
]

const PROBLEMS: { n: string; title: string; body: string; shot: Shot }[] = [
  {
    n: '01',
    title: 'People come once',
    body: 'Most first-timers never come back, and there is no system for noticing who drifted or for asking them back.',
    shot: { src: p('circle-sunset'), alt: 'A circle on a seaside terrace at sunset' },
  },
  {
    n: '02',
    title: 'One person carries it',
    body: 'Planning, messages, setup, money and hard conversations all run through the organizer until something gives.',
    shot: { src: p('writing-cushions'), alt: 'Two people writing on cushions in a garden' },
  },
  {
    n: '03',
    title: 'The numbers don’t work',
    body: 'Rent, supplies and hours add up. Without a break-even, a full room can still lose money.',
    shot: { src: p('craft-table'), alt: 'A long table of adults and kids making crafts in a studio' },
  },
]

/** The four weeks. The title is the week's name; the meeting it teaches sits under it. */
const WEEKS: {
  n: string
  day: string
  name: string
  meeting: string
  cadence: string
  fixes: string
  leave: string
  shot: Shot
}[] = [
  {
    n: '01',
    day: '7',
    name: 'The Engine',
    meeting: 'The weekly sit-down',
    cadence: '30 min, weekly',
    fixes: 'Everything runs through you, so nothing gets your full attention.',
    leave: 'A two-week plan with three active priorities, and a fixed time each week to review it.',
    shot: { src: p('fire-meditation'), alt: 'Three people meditating by a fire at night' },
  },
  {
    n: '02',
    day: '14',
    name: 'The Container',
    meeting: 'The opening',
    cadence: 'First 30 min of every gathering',
    fixes: 'Unwritten norms, so the loudest person ends up setting them.',
    leave: 'A one-line purpose, three agreements you read aloud, a check-in question, and who people can go to.',
    shot: { src: p('small-circle'), alt: 'A small circle seated on a seaside terrace, eyes closed' },
  },
  {
    n: '03',
    day: '21',
    name: 'The Gathering',
    meeting: 'The full gathering',
    cadence: '90 min, plus 10 the next day',
    fixes: 'Gatherings that wobble at the start, the transitions and the end.',
    leave: 'A one-page run sheet for a 90-minute gathering, and a next-day routine to see who came back.',
    shot: { src: p('lawn-rest'), alt: 'A guided rest on a garden lawn, a teacher walking between the mats' },
  },
  {
    n: '04',
    day: '28',
    name: 'The Exchange',
    meeting: 'The money hour',
    cadence: '45 min, monthly',
    fixes: 'Income that does not cover what it costs you to show up.',
    leave: 'Your break-even number, a price you can say plainly, and a policy for reduced-price spots.',
    shot: { src: p('garden-rugs'), alt: 'A workshop in a garden, people on rugs and cushions' },
  },
]

const PULSE: { letter: string; word: string; sub: string; body: string; minutes: number }[] = [
  { letter: 'P', word: 'Presence', sub: 'The idea', body: 'A short story and the one idea for the week.', minutes: 10 },
  { letter: 'U', word: 'Unite', sub: 'Check in and count', body: 'How the week went, and your return number.', minutes: 20 },
  { letter: 'L', word: 'Lead', sub: 'Learn the meeting', body: 'The week’s meeting, step by step, with a worked example.', minutes: 35 },
  {
    letter: 'S',
    word: 'Settle',
    sub: 'The hard part',
    body: 'What this work stirs up, like naming a price or holding a line, and how to stay steady.',
    minutes: 15,
  },
  { letter: 'E', word: 'Exhale', sub: 'Commit', body: 'One commitment said out loud, and the week’s one-page document.', minutes: 10 },
]

/** An illustration, labelled as one on the page: share of the first month's room, per month. */
const BARS: { month: string; came: number; back: number }[] = [
  { month: 'Month 1', came: 100, back: 0 },
  { month: 'Month 2', came: 88, back: 34 },
  { month: 'Month 3', came: 92, back: 52 },
  { month: 'Month 4', came: 96, back: 70 },
]

const BOOK: { week: string; page: string }[] = [
  { week: 'Week 1 · The Engine', page: 'The weekly sit-down' },
  { week: 'Week 2 · The Container', page: 'The opening' },
  { week: 'Week 3 · The Gathering', page: 'The run sheet' },
  { week: 'Week 4 · The Exchange', page: 'The money page' },
]

function Img({ shot, sizes, className, priority }: { shot: Shot; sizes: string; className?: string; priority?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the .pa-boc slot sizes its own img (object-fit cover)
    <img
      className={className}
      loading={priority ? undefined : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      {...photoImg(shot.src, sizes)}
      alt={shot.alt}
    />
  )
}

function Arrow() {
  return (
    <svg className="boc-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

function Clock() {
  return (
    <svg className="boc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

function Check() {
  return (
    <svg className="boc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/** A section head: the eyebrow and title on the left, the supporting line on the right. */
function Head({ label, title, children }: { label: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="boc-head">
      <div>
        <span className="boc-k">{label}</span>
        <h2 className="boc-h2">{title}</h2>
      </div>
      {children && <p className="boc-p">{children}</p>}
    </div>
  )
}

function SaveSeat() {
  return (
    <Link className="btn fq-iri-btn" href={EVENT}>
      Save your seat
      <Arrow />
    </Link>
  )
}

export function FrequencyBusinessOfCommunity() {
  return (
    <div className="pa-page pa-boc" data-motion-scope style={{ display: 'contents' }}>
      <section className="boc-hero" data-screen-label="01 Hero">
        <div className="fq-aura" style={aura(0.22)} />
        <div className="wrap boc-hero-g">
          <div>
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span aria-hidden="true">/</span>
              <Link href="/courses">Courses</Link>
              <span aria-hidden="true">/</span>
              <span>The Business of Community</span>
            </nav>
            <span className="boc-pill">
              <i aria-hidden="true" />
              Free launch workshop · Starts Thursday, January 7
            </span>
            <h1 className="boc-h1">
              The Business of <em className="boc-s fq-iri-text">Community</em>
            </h1>
            <p className="boc-lede">
              A free four-week live workshop for people who run communities of any kind. Learn the four meetings that keep
              people coming back, keep the work off one person, and make the numbers add up.
            </p>
            <div className="ctas">
              <SaveSeat />
              <Link className="btn btn-ghost fq-iri-rim" href={WEEK_ONE}>
                Read Week 1 free
              </Link>
            </div>
            <div className="boc-leads">
              <span className="boc-faces">
                {/* eslint-disable-next-line @next/next/no-img-element -- a 44px face, sized by .boc-faces */}
                <img {...photoImg(p('guide-daniel'), '44px')} alt="Daniel Tyack" />
                {/* eslint-disable-next-line @next/next/no-img-element -- a 44px face, sized by .boc-faces */}
                <img {...photoImg(p('guide-feargal'), '44px')} alt="Feargal Walsh" />
              </span>
              <p>
                Led by <b>Daniel Tyack</b> and <b>Feargal Walsh</b>. Hosted by <b>Frequency</b>. Free for anyone, on Zoom.
              </p>
            </div>
          </div>
          <div className="boc-hero-art">
            <figure className="boc-hero-main fq-iri-rim">
              <Img priority shot={{ src: p('circle-dusk'), alt: 'A circle seated on cushions on a seaside terrace at dusk' }} sizes="(max-width: 980px) 90vw, 46vw" />
              <span className="fq-grain" />
            </figure>
            <figure className="boc-hero-small">
              <Img shot={{ src: p('group-hug'), alt: 'A big group hug on a terrace by the ocean' }} sizes="(max-width: 980px) 70vw, 28vw" />
            </figure>
            <div className="boc-run fq-panel">
              <div className="boc-run-t">
                <b>The January Run</b>
                <span className="boc-chip boc-chip-g">Free</span>
              </div>
              <div className="boc-dates">
                {WEEKS.map((w) => (
                  <div className="boc-date" key={w.n}>
                    <small>JAN</small>
                    <b>{w.day}</b>
                    <span>{w.name}</span>
                  </div>
                ))}
              </div>
              <p className="boc-m">
                <Clock />
                Thursdays, 10 to 11:30 AM Pacific · Zoom
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="boc-band" aria-label="Communities on Frequency">
        <div className="boc-band-in">
          {BAND.map((s) => (
            <figure className="boc-shot" key={s.src}>
              <Img className={s.crop} shot={s} sizes="(max-width: 980px) 80vw, 34vw" />
            </figure>
          ))}
        </div>
      </section>

      <section className="boc-who">
        <div className="wrap boc-who-in">
          <span className="boc-who-l">Built for people who run</span>
          <div className="boc-tags">
            {WHO.map((t) => (
              <span className="boc-tag" key={t}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" data-screen-label="02 The problem">
        <div className="wrap">
          <Head
            label="The problem"
            title={
              <>
                Communities rarely fail for lack of interest. They fail for lack of <em className="boc-s">operations.</em>
              </>
            }
          >
            Good intentions fill a room once. Keeping it going takes a few repeatable habits that nobody teaches: a planning
            rhythm, clear norms, a dependable format and a price that covers the costs.
          </Head>
          <div className="boc-probs">
            {PROBLEMS.map((pr) => (
              <article className="boc-prob" key={pr.n}>
                <div className="boc-prob-ph">
                  <Img shot={pr.shot} sizes="(max-width: 980px) 90vw, 30vw" />
                  <span className="boc-n">{pr.n}</span>
                </div>
                <div className="boc-prob-b">
                  <h3 className="boc-h3">{pr.title}</h3>
                  <p className="boc-p">{pr.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec boc-sunk" data-screen-label="03 The one number">
        <div className="wrap boc-metric">
          <div>
            <span className="boc-k">The one number</span>
            <h2 className="boc-h2">
              Measure who comes <em className="boc-s">back,</em> not who came.
            </h2>
            <p className="boc-p boc-gap">
              Headcount tells you how good the invite was. Return rate tells you whether you are building a community. The
              whole workshop is built around that one number, and each week gives you another way to move it.
            </p>
            <blockquote className="boc-quote">
              <p>“The question isn’t how many came. It’s how many came back.”</p>
              <cite>
                {/* eslint-disable-next-line @next/next/no-img-element -- a 32px face, sized by .boc-quote */}
                <img {...photoImg(p('guide-daniel'), '32px')} alt="" />
                Daniel Tyack, Founder and Architect of Frequency
              </cite>
            </blockquote>
          </div>
          <figure className="boc-metric-art">
            <Img shot={{ src: p('group-blue-sky'), alt: 'A big group photo on a terrace by the ocean, under a blue sky' }} sizes="(max-width: 980px) 90vw, 46vw" />
            <div className="boc-gauge fq-panel">
              <span className="boc-lab">Example · one monthly gathering</span>
              <div className="boc-bars" role="img" aria-label="An illustration: the people who came back grow month by month while the room stays about the same size.">
                {BARS.map((b) => (
                  <div className="boc-bar" key={b.month}>
                    <i style={{ height: `${b.came}%` }} />
                    <i className="b" style={{ height: `${b.back}%` }} />
                    <small>{b.month}</small>
                  </div>
                ))}
              </div>
              <div className="boc-legend">
                <span>
                  <i />
                  Everyone who came
                </span>
                <span>
                  <i className="b" />
                  Came back
                </span>
              </div>
              <p className="boc-m">An illustration. Your own number starts in Week 1.</p>
            </div>
          </figure>
        </div>
      </section>

      <section className="sec" id="curriculum" data-screen-label="04 The curriculum">
        <div className="wrap">
          <Head
            label="The curriculum"
            title={
              <>
                Four weeks. Four meetings you can <em className="boc-s">run.</em>
              </>
            }
          >
            Each week teaches one meeting you run with your community. Read the overview and the lesson before the session,
            practice it live, and leave with a one-page document you keep using.
          </Head>
          <div className="boc-weeks">
            {WEEKS.map((w) => (
              <article className="boc-week" key={w.n}>
                <figure className="boc-week-ph">
                  <Img shot={w.shot} sizes="(max-width: 980px) 90vw, 300px" />
                  <figcaption>
                    <span>Week {w.n}</span>
                    <b>Jan {w.day}</b>
                  </figcaption>
                </figure>
                <div className="boc-week-b">
                  <div className="boc-week-t">
                    <h3 className="boc-h3">{w.name}</h3>
                    <span className="boc-chip">
                      <Clock />
                      {w.meeting} · {w.cadence}
                    </span>
                  </div>
                  <div className="boc-week-g">
                    <div>
                      <span className="boc-lab">What it fixes</span>
                      <p className="boc-p">{w.fixes}</p>
                    </div>
                    <div>
                      <span className="boc-lab">You leave with</span>
                      <p className="boc-p">{w.leave}</p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="boc-pulse" data-screen-label="05 PULSE">
        <div className="boc-pulse-bg">
          <Img shot={{ src: p('circle-arms-up'), alt: '' }} sizes="100vw" />
        </div>
        <div className="wrap">
          <Head
            label="The format"
            title={
              <>
                Every session runs on <em className="boc-s">PULSE.</em>
              </>
            }
          >
            PULSE is Frequency’s five-part meeting format. Each live session follows it, so you practice the format before you
            use it with your community. Settle is the part most business courses skip.
          </Head>
          <div className="boc-beats">
            {PULSE.map((b) => (
              <div className="boc-beat fq-panel" key={b.letter}>
                <span className="boc-beat-l fq-iri-text" aria-hidden="true">
                  {b.letter}
                </span>
                <b>{b.word}</b>
                <span className="boc-beat-s">{b.sub}</span>
                <p>{b.body}</p>
                <span className="boc-beat-m">{b.minutes} min live</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="ways" data-screen-label="06 Two ways in">
        <div className="wrap">
          <Head
            label="Two ways in"
            title={
              <>
                Start with the workshop. Keep going <em className="boc-s">every week.</em>
              </>
            }
          >
            The workshop is free for anyone and runs several times a year. Business Hours is the weekly Circle for Spaces on the
            Business plan.
          </Head>
          <div className="boc-ways">
            <article className="boc-way">
              <figure className="boc-way-ph">
                <Img shot={{ src: p('beach-yoga'), alt: 'A yoga class in tree pose on the beach' }} sizes="(max-width: 980px) 90vw, 46vw" />
                <span className="boc-chip boc-chip-g">Free</span>
              </figure>
              <div className="boc-way-b">
                <span className="boc-k">Live on Zoom · Runs several times a year</span>
                <h3 className="boc-h3">The Business of Community workshop</h3>
                <p className="boc-m">First Run: Thursdays, January 7 to 28</p>
                <ul className="boc-list">
                  <li>
                    <Check />
                    Four 90-minute sessions with Daniel and Feargal
                  </li>
                  <li>
                    <Check />
                    An overview, a lesson and homework each week
                  </li>
                  <li>
                    <Check />
                    Practice each meeting with other organizers
                  </li>
                </ul>
                <SaveSeat />
              </div>
            </article>
            <article className="boc-way">
              <figure className="boc-way-ph">
                <Img className="boc-crop-top" shot={{ src: p('fire-night'), alt: 'Friends around a fire pit at night' }} sizes="(max-width: 980px) 90vw, 46vw" />
                <span className="boc-chip">Business plan</span>
              </figure>
              <div className="boc-way-b">
                <span className="boc-k">Members-only Circle</span>
                <h3 className="boc-h3">Business Hours</h3>
                <p className="boc-m">Wednesdays, 10 AM Pacific</p>
                <ul className="boc-list">
                  <li>
                    <Check />
                    The same small group of operators each week
                  </li>
                  <li>
                    <Check />
                    Runs on PULSE. Bring one number and one problem
                  </li>
                  <li>
                    <Check />
                    Certified review after February 28
                  </li>
                </ul>
                <Link className="btn btn-ghost fq-iri-rim" href={BUSINESS_HOURS}>
                  See Business Hours
                  <Arrow />
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="sec boc-warm" id="guides" data-screen-label="07 Your guides">
        <div className="wrap">
          <Head
            label="Your guides"
            title={
              <>
                Taught by people who run <em className="boc-s">communities</em> and build the tools to make them work.
              </>
            }
          >
            Daniel and Feargal lead every session of the workshop together. Frequency hosts it.
          </Head>
          <div className="boc-guides">
            <article className="boc-guide">
              {/* eslint-disable-next-line @next/next/no-img-element -- a 160px round portrait, sized by .boc-guide-ph */}
              <img className="boc-guide-ph" loading="lazy" decoding="async" {...photoImg(p('guide-daniel'), '160px')} alt="Daniel Tyack" />
              <div>
                <span className="boc-lab">Founder and Architect, Frequency</span>
                <h3 className="boc-h3">Daniel Tyack</h3>
                <p className="boc-p">
                  Daniel has spent years building and leading rooms, from music to men’s work to ceremony. He founded Frequency
                  and created PULSE, the format the workshop runs on.
                </p>
                <p className="boc-m boc-leads-line">
                  <b>Leads</b> the live sessions, the stories and the Settle practice
                </p>
              </div>
            </article>
            <article className="boc-guide">
              {/* eslint-disable-next-line @next/next/no-img-element -- a 160px round portrait, sized by .boc-guide-ph */}
              <img className="boc-guide-ph" loading="lazy" decoding="async" {...photoImg(p('guide-feargal'), '160px')} alt="Feargal Walsh" />
              <div>
                <span className="boc-lab">Experience and Technology, Frequency</span>
                <h3 className="boc-h3">Feargal Walsh</h3>
                <p className="boc-p">
                  Feargal leads Frequency’s technology and member experience. He turns the systems organizers need into tools
                  that are simple to run week after week.
                </p>
                <p className="boc-m boc-leads-line">
                  <b>Leads</b> the operating tools, and setting it all up on Frequency
                </p>
              </div>
            </article>
          </div>
          <p className="boc-m boc-center">
            Hosted by Frequency, a community collective for people who gather others. The workshop is part of Frequency’s free
            core training.
          </p>
        </div>
      </section>

      <section className="sec" data-screen-label="08 Community Book">
        <div className="wrap boc-cert">
          <figure className="boc-cert-art">
            <Img shot={{ src: p('writing-cushions'), alt: 'Two people writing on cushions in a garden' }} sizes="(max-width: 980px) 90vw, 46vw" />
            <div className="boc-book" aria-hidden="true">
              {BOOK.map((b) => (
                <div className="boc-page fq-panel" key={b.week}>
                  <small>{b.week}</small>
                  <b>{b.page}</b>
                  <i />
                  <i />
                  <i />
                </div>
              ))}
            </div>
          </figure>
          <div>
            <span className="boc-k">Finish with a certificate</span>
            <h2 className="boc-h2">
              Your Community Book, <em className="boc-s">reviewed.</em>
            </h2>
            <p className="boc-p boc-gap">
              The four one-page documents you write during the workshop become your Community Book: a working operations manual
              for your community.
            </p>
            <div className="boc-tiers">
              <div className="boc-tier">
                <b>Attended</b>
                <p className="boc-p">Complete all four weeks of the workshop.</p>
              </div>
              <div className="boc-tier boc-tier-on">
                <b>Certified</b>
                <p className="boc-p">
                  Send in your Community Book, filled in from real gatherings, by February 28, 2027 for free Certified review.
                  After that, review comes with the Business plan.
                </p>
              </div>
            </div>
            <p className="boc-m boc-gap-s">
              Each one has its own page anyone can check, and a badge for your Space or your site. A certificate of
              completion and competency from Frequency. Not an accredited certification.
            </p>
          </div>
        </div>
      </section>

      <section className="sec boc-sunk" data-screen-label="09 Questions">
        <div className="wrap boc-faq">
          <div>
            <span className="boc-k">Questions</span>
            <h2 className="boc-h2">
              Before you <em className="boc-s">start.</em>
            </h2>
            <p className="boc-p boc-gap">Anything else, ask. A person on the Frequency team answers.</p>
          </div>
          <div>
            <JsonLd data={faqSchema(BOC_FAQ)} />
            <div className="qa">
              {BOC_FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="boc-close" data-screen-label="10 Close">
        <div className="boc-close-bg">
          <Img shot={{ src: p('group-hug'), alt: '' }} sizes="100vw" />
        </div>
        <div className="wrap boc-close-in">
          <span className="boc-k">Free · Four weeks · Starts January 7</span>
          <h2 className="boc-h2 boc-close-h">
            Build a community people come <em className="boc-s">back</em> to.
          </h2>
          <div className="ctas">
            <SaveSeat />
            <a className="btn btn-ghost fq-iri-rim" href={RUN_ICS}>
              Add all four to your calendar
            </a>
          </div>
          <div className="boc-close-lead">
            <p className="boc-m">Not ready to sign up? Get Week 1 and the dates in your inbox.</p>
            <CourseLeadForm slug={JOURNEY_SLUG} />
          </div>
        </div>
      </section>
    </div>
  )
}
