// /themes/new-world (LIVE-2059): the feature page for the New World theme, set up the way Nocturne's is
// (frequency-midnight.tsx). Server component; the one client island is the preview stage (new-world-preview.tsx).
// Every picture is a render of the kit's own surfaces (real site chrome and blocks, real Spotlight layout, a Space inside the real
// member shell, the real email module) under public/brand/new-world-kit. New World is not in the theme library catalog yet (it is
// hidden from the pickers until Daniel rules), so every surface is read as ready here: each one has a real render. The page is
// reachable by its address and carries noindex until the theme is un-hidden. Copy follows docs/marketing/voice-and-language-guide.md.
// Styles: new-world-feature.css, tokens only.
import Image from 'next/image'
import Link from 'next/link'
import { Fragment } from 'react'
import { FreeSpotlightButton } from '@/components/marketing/free-spotlight-button'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import '@/app/themes/active/site-pages-b'
import { createSpaceHref } from '@/lib/create-space/href'
import { NEW_WORLD_KIT_LAYOUTS } from '@/components/spotlight/new-world-kit-layouts'
import { THEME_LOOK_CONTROLS, THEME_TOOLS } from '@/lib/themes/library'
import {
  NEW_WORLD_DEFAULT_KIT,
  NEW_WORLD_KITS,
  newWorldLayoutShot,
  newWorldShot,
  type NewWorldSurface,
} from '@/lib/themes/new-world-feature-data'
import { NewWorldBrowser, NewWorldMail, NewWorldPhone, NewWorldStage, type NewWorldSurfaceStatus } from './new-world-preview'

const START_HREF = createSpaceHref('new-world')

const PAGES: [string, string][] = [
  ['Home', 'What happens here, who it is for and a way to come along. The first thing people see.'],
  ['Services', 'Every offer with its length, price and a button. Free first visits are written as Free.'],
  ['Events', 'Dated gatherings with seats people can save, as a list or a calendar.'],
  ['Book', 'Pick a time without a phone call. Pulls from your booking tool.'],
  ['Join', 'Memberships and plans with member pricing, pause and change.'],
  ['About', 'Who is behind it, in your words, with the same face and accent as everywhere else.'],
]
const EMAILS: [string, string][] = [
  ['Confirm', 'What was booked, when and where.'],
  ['Reminder', 'The day before, with the facts.'],
  ['Welcome', 'What to expect and the next three steps.'],
  ['Review', 'A friendly ask after a visit.'],
  ['Receipt', 'What was paid, for what, and when.'],
  ['Post', 'A note or story from you.'],
  ['Event', 'An invitation with a date and a button.'],
  ['Order', 'What was bought and what happens next.'],
  ['Member', 'A plan, its price and how to change it.'],
  ['Letter', 'The next few dates and one offer.'],
  ['Inquiry', 'A reply that lists what you do and what it costs.'],
]
const BUILT: [string, string, string][] = [
  ['Color', 'Contrast-checked color', 'Night and Day are both checked, so buttons, links and labels read in either.'],
  ['Input', 'Keyboard and screen readers', 'Every button, tab, menu and form across all four surfaces is reachable, focusable and labelled.'],
  ['Email', 'Survives real inboxes', 'The emails are built in tables with inline styles and email-safe fallbacks for the display face.'],
  ['Data', 'Your people stay yours', 'Sign-ups, bookings and check-ins land in your contacts. Export them any time.'],
]
const SETUP: [string, string, string][] = [
  ['01', 'Choose a kit', 'Pick the closest of the seven. The preview updates as you choose.'],
  ['02', 'Name and tools', 'Keep the kit’s tools or add more: booking, events, membership, a shop.'],
  ['03', 'Your look', 'Night or Day, Tide or your own accent, your corners and spacing.'],
  ['04', 'Go live', 'Your Spotlight is live today. Space, website and emails switch on with a Business account, or wait as a draft.'],
]

const BEFORE: [string, string][] = [
  ['Link in bio', 'Points away to everything else'],
  ['Booking tool', 'Its own brand on your calendar'],
  ['Payments app', 'A receipt that does not look like you'],
  ['Email tool', 'A separate list, a separate look'],
  ['Website builder', 'Your copy, written a second time'],
]
const AFTER: [string, string][] = [
  ['Spotlight', 'Books and gathers on the page'],
  ['Space', 'Found on the network, wearing your look'],
  ['Website', 'Your own domain, same blocks'],
  ['Email', 'Your list, in the same look'],
  ['One profile', 'One login, one list, one look'],
]

const CARRY: { row: string; cells: (string | true)[] }[] = [
  { row: 'Name and mark', cells: [true, true, true, true] },
  { row: 'Fonts and accent', cells: [true, 'On Frequency’s frame', true, true] },
  { row: 'Offers, dates and prices', cells: [true, true, true, 'The next few'] },
  { row: 'Headline and copy', cells: [true, 'Tagline', true, 'Opening line'] },
  { row: 'Main button', cells: [true, true, true, true] },
  { row: 'Night or Day', cells: [true, true, true, true] },
]

const FAQ: [string, string][] = [
  ['Can I start with only a Spotlight?', 'Yes. Most people do. Your Space and website use the same profile, so they are ready when you are, with nothing to rewrite.'],
  ['Will my Space look exactly like my website?', 'Your Space keeps Frequency’s page frame, so people on the network always know where they are. It wears your name, fonts, accent and offers, so it reads as you.'],
  ['Does it work for my kind of Space?', 'If people gather at your place, yes. The kits cover coaches, studios, hosts, venues, non-profits and networks, and Your place fits anything in between.'],
  ['Is there a light version?', 'Yes. Night is where it starts and Day is one switch away. Both use the same blocks, accent and words.'],
  ['What happens if I change my mind about the look?', 'Press Change theme in your editor. Your words, offers and photos stay saved. New World is only the dress they wear.'],
  ['Who owns my contacts?', 'You do. Sign-ups, RSVPs and check-ins build your list, and your list stays yours.'],
  ['What does it cost?', 'Free to start. Business when you charge.'],
]

/** The layouts whose top is paper, not a photo: the phone's status bar reads dark on them. */
const LIGHT_TOP = new Set<string>([])

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

function Status({ s }: { s: NewWorldSurfaceStatus }) {
  return <small className={`nwf-st ${s}`}>{s === 'ready' ? 'Ready' : 'On the way'}</small>
}

const SIGNATURE = 'Night ink and Day paper, one Tide accent, pill buttons, with Unbounded, Hanken Grotesk and Instrument Serif.'

export function FrequencyNewWorld() {
  const status: Record<NewWorldSurface, NewWorldSurfaceStatus> = { site: 'ready', spotlight: 'ready', space: 'ready', email: 'ready' }
  const kit = NEW_WORLD_DEFAULT_KIT
  const places: { n: string; name: string; qual?: string; surface: NewWorldSurface; body: string; lives: string; wears: string; changes: string }[] = [
    {
      n: '01 · Day one',
      name: 'Spotlight',
      qual: 'Link Page',
      surface: 'spotlight',
      body: 'Your link-in-bio page. The same hero, ways in and next gathering your website opens with.',
      lives: 'Its own Spotlight link',
      wears: 'The full theme',
      changes: 'Your bio link books a place on the first tap.',
    },
    {
      n: '02 · On the network',
      name: 'Space',
      qual: 'Profile',
      surface: 'space',
      body: 'Your page on Frequency, where people looking for their people find you. Frequency keeps its frame; the page wears your fonts, your accent and your offers.',
      lives: 'frequency.com/spaces/yourplace',
      wears: 'Frequency, with your fonts and accent',
      changes: 'You are found by people already looking.',
    },
    {
      n: '03 · Your own domain',
      name: 'Website',
      surface: 'site',
      body: 'Gatherings, programs, ceremonies, membership and a shop as you need them. Built from the same blocks, so nothing is written twice.',
      lives: 'yourplace.com',
      wears: 'The full theme',
      changes: 'A complete site, without starting again.',
    },
    {
      n: '04 · In the inbox',
      name: 'Email template',
      surface: 'email',
      body: 'Templates that wear your mark, face and accent: a note, a welcome, the next few dates and a receipt. Dates, tiers and names fill in from the same profile.',
      lives: 'Your subscribers’ inbox',
      wears: 'the theme, in tables that survive email clients',
      changes: 'Your list hears from you, and it looks like you.',
    },
  ]
  const shotFor = (s: NewWorldSurface) => (s === 'spotlight' ? newWorldShot(kit, 'spot') : s === 'space' ? newWorldShot(kit, 'spacedesk') : s === 'email' ? newWorldShot(kit, 'email') : newWorldShot(kit, 'site'))

  return (
    <div className="nwf" style={vars({ '--c': 'var(--fq-x-sun-neon)' })}>
      <section className="phero big nwf-hero" data-energy="flow" data-screen-label="01 Hero">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.35 })} />
        <div className="fq-grain" />
        <div className="nwf-wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/spaces">For Spaces</Link>
            <span aria-hidden="true">/</span>
            <Link href="/themes">Themes</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">New World</span>
          </nav>
          <div className="nwf-split">
            <div className="nwf-top">
              <div className="label">
                <b>Theme</b>New World · by Frequency
              </div>
              <h1 className="nwf-h1 nwf-name" style={vars({ '--nwf-chars': 'New World'.length })}>
                New World
              </h1>
              <p className="nwf-aft">A Frequency Theme</p>
              <p className="nwf-tagline">
                Design it once.
                <br />
                <em className="fq-iri-text">Same theme everywhere.</em>
              </p>
              <p className="nwf-lead">
                Your link in bio, your Space, your website and your emails each look a little different. New World is the theme every new Space starts in:
                studios, coaches, hosts, venues, non-profits and networks, one look to wear on all four, read from one profile. Night to start, Day when you want it.
                Change it once and every surface follows.
              </p>
              <div className="ctas">
                <a className="btn fq-iri-btn" href={START_HREF}>
                  Use New World
                </a>
                <a className="btn btn-ghost fq-iri-rim" href="#preview">
                  See it on every surface
                </a>
                <FreeSpotlightButton surface="theme" detail="new-world" />
              </div>
            </div>
            <div className="nwf-hero-shot">
              <NewWorldStage priority status={status} />
            </div>
          </div>
          <a className="nwf-more" href="#why">
            <span>Where a place that gathers people lives online</span>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <div className="nwf-cascade" id="places">
            {places.map((p, i) => (
              <Fragment key={p.name}>
                {i > 0 ? (
                  <svg className={`nwf-thread ${i % 2 ? 'lr' : 'rl'}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <path d={i % 2 ? 'M 24 0 C 24 55, 76 45, 76 100' : 'M 76 0 C 76 55, 24 45, 24 100'} vectorEffect="non-scaling-stroke" />
                  </svg>
                ) : null}
              <div className={`nwf-cz ${i % 2 ? 'r' : 'l'}`}>
                <div className="nwf-cz-dev">
                  <span className="nwf-dvlab">{p.qual ? `${p.name} · ${p.qual}` : p.name}</span>
                  {p.surface === 'spotlight' ? (
                    <NewWorldPhone src={shotFor(p.surface)} alt={`New World: ${p.name.toLowerCase()}`} sizes="(max-width: 900px) 60vw, 300px" />
                  ) : p.surface === 'site' ? (
                    <NewWorldBrowser src={shotFor(p.surface)} alt={`New World: ${p.name.toLowerCase()}`} url="yourplace.com" width={1280} height={800} sizes="(max-width: 900px) 92vw, 640px" />
                  ) : p.surface === 'space' ? (
                    <NewWorldBrowser src={shotFor(p.surface)} alt="New World: space" url="frequency.com/spaces/yourplace" width={1280} height={770} sizes="(max-width: 900px) 92vw, 640px" />
                  ) : (
                    <NewWorldMail src={shotFor(p.surface)} alt="New World: email" sizes="(max-width: 900px) 70vw, 380px" />
                  )}
                </div>
                <div className="nwf-cz-tx">
                  <span className="jn">{p.n}</span>
                  <h3>
                    {p.name}
                    {p.qual ? <small className="nwf-q">{p.qual}</small> : null}
                    <Status s={status[p.surface]} />
                  </h3>
                  <p>{p.body}</p>
                  <ul>
                    <li>
                      <b>Lives at</b>
                      {p.lives}
                    </li>
                    <li>
                      <b>Wears</b>
                      {p.wears}
                    </li>
                  </ul>
                  <p className="nwf-out">
                    <b>What changes</b>
                    {p.changes}
                  </p>
                </div>
              </div>
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="why" data-screen-label="03 Today">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Today</b>Where a place that gathers people lives online
            </div>
            <h2 className="h-l">Five tools. Five logins. Five versions of you.</h2>
          </div>
          <div className="nwf-stack">
            <div className="nwf-st-card before">
              <span className="label">Before · five tools</span>
              {BEFORE.map(([a, b]) => (
                <div className="nwf-row" key={a}>
                  <span>
                    <i />
                    {a}
                  </span>
                  <em>{b}</em>
                </div>
              ))}
              <p className="nwf-st-p">
                Each one is fine on its own. Together they drift: a price changes in one place and not the others, and every hand-off is a place to
                lose someone.
              </p>
            </div>
            <span className="nwf-arrow" aria-hidden="true">
              →
            </span>
            <div className="nwf-st-card after">
              <span className="label">With a Theme Kit · one profile</span>
              {AFTER.map(([a, b]) => (
                <div className="nwf-row" key={a}>
                  <span>
                    <i />
                    {a}
                  </span>
                  <em>{b}</em>
                </div>
              ))}
              <p className="nwf-st-p">
                Change a gathering time, a membership or a headline once. The surfaces marked ready follow, and everyone who signs up lands in the same list.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="preview" data-screen-label="04 Theme preview">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Seven kits</b>Each tuned to one kind of place
            </div>
            <h2 className="h-l">Try it on before you choose.</h2>
            <p className="nwf-sh-p">Pick a kit. Switch surfaces. Every picture is the New World theme reading one profile.</p>
          </div>
          <div className="nwf-try">
            <NewWorldStage kits status={status} />
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="inside" data-screen-label="05 Inside the kit">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Inside the kit</b>Everything a kit ships with
            </div>
            <h2 className="h-l">More than a homepage.</h2>
            <p className="nwf-sh-p">Every kit is a complete site, not a template: pages, the tools behind them, eleven emails, and Spotlight layouts, all wearing one look.</p>
          </div>
          <h3 className="nwf-grp">Pages</h3>
          <div className="nwf-cards">
            {PAGES.map(([name, body]) => (
              <div className="nwf-card" key={name}>
                <h3>{name}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
          <h3 className="nwf-grp">Tools</h3>
          <div className="nwf-cards">
            {THEME_TOOLS.map((t) => (
              <div className="nwf-card" key={t.name}>
                <h3>{t.name}</h3>
                <p>{t.body}</p>
              </div>
            ))}
          </div>
          <h3 className="nwf-grp">Emails</h3>
          <div className="nwf-cards">
            {EMAILS.map(([name, body]) => (
              <div className="nwf-card" key={name}>
                <h3>{name}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
          <div id="layouts">
            <h3 className="nwf-grp">Spotlight layouts · New World</h3>
          <div className="nwf-layouts">
            {NEW_WORLD_KIT_LAYOUTS.map((l, i) => {
              const id = l.id.slice('new-world-kit:'.length)
              return (
                <figure key={l.id}>
                  <NewWorldPhone tone={LIGHT_TOP.has(id) ? 'dark' : 'light'} src={newWorldLayoutShot(id)} alt={`New World Spotlight layout: ${l.label}`} sizes="(max-width: 900px) 44vw, 200px" />
                  <figcaption>
                    <b>
                      <span>{`0${i + 1}`}</span>
                      {l.label}
                    </b>
                    <small>{l.blurb}</small>
                  </figcaption>
                </figure>
              )
            })}
          </div>
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="yours" data-screen-label="06 Make it yours">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Make it yours</b>Keep the kit, change the look
            </div>
            <h2 className="h-l">Your accent. Your face. Your corners.</h2>
            <p className="nwf-sh-p">
              {SIGNATURE} Change the look from your editor and every surface that wears the theme follows. Your Space page stays the
              Frequency page people know, wearing your fonts and accent.
            </p>
          </div>
          <div className="nwf-cards">
            {THEME_LOOK_CONTROLS.map((c) => (
              <div className="nwf-card" key={c.name}>
                <h3>{c.name}</h3>
                <p>{c.options}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="kits" data-screen-label="07 Thirteen kits">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Seven kits</b>Each tuned to one kind of place
            </div>
            <h2 className="h-l">
              See it. Preview it. <em className="fq-iri-text">Make it yours.</em>
            </h2>
          </div>
          <div className="nwf-kgrid">
            {NEW_WORLD_KITS.map((k) => (
              <a className="nwf-kit" key={k.id} href={`${START_HREF}?niche=${k.id}`} style={vars({ '--c': k.hex })}>
                <Image src={newWorldShot(k.id, 'site')} alt={`New World, ${k.name}: website`} width={1280} height={800} sizes="(max-width: 900px) 46vw, 280px" />
                <span>
                  <i />
                  <b>{k.name}</b>
                  <small>{k.who}</small>
                </span>
              </a>
            ))}
          </div>
          <p className="nwf-sh-p">Every picture is the real kit. The seven share one New World look and each is written for a different kind of place. Switch kits any time; your words, offers and dates stay.</p>
        </div>
      </section>

      <section className="sec pb-sec" id="carry" data-screen-label="08 What carries over">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>What carries over</b>Change it once
            </div>
            <h2 className="h-l">One profile. Every surface follows.</h2>
          </div>
          <div className="nwf-cmp" role="table" aria-label="What carries to each surface">
            <div className="nwf-cmp-row" role="row">
              <div className="hd" role="columnheader" />
              <div className="hd" role="columnheader">Spotlight</div>
              <div className="hd" role="columnheader">Space</div>
              <div className="hd" role="columnheader">Website</div>
              <div className="hd" role="columnheader">Email</div>
            </div>
            {CARRY.map((r) => (
              <div className="nwf-cmp-row" role="row" key={r.row}>
                <div className="rw" role="rowheader">{r.row}</div>
                {r.cells.map((c, i) =>
                  c === true ? (
                    <div className="y" role="cell" key={i}>
                      <span className="vh">Carries in full</span>
                    </div>
                  ) : (
                    <div className="p" role="cell" key={i}>
                      <span>{c}</span>
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
          <p className="nwf-legend">
            <i className="y" aria-hidden="true" />
            Carries in full<i className="p" aria-hidden="true" />
            Carries, adapted to the surface
          </p>
        </div>
      </section>

      <section className="sec pb-sec" id="built" data-screen-label="09 Built right">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Built right</b>Accessible, send-ready, yours
            </div>
            <h2 className="h-l">The parts you should never have to think about.</h2>
          </div>
          <div className="nwf-setup">
            {BUILT.map(([n, t, b]) => (
              <div key={t}>
                <span className="n">{n}</span>
                <b>{t}</b>
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="questions" data-screen-label="10 Questions">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Questions</b>Before you start
            </div>
            <h2 className="h-l">Good to know.</h2>
          </div>
          <div className="nwf-faq">
            {FAQ.map(([q, a], i) => (
              <details key={q} open={i === 0}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="steps" data-screen-label="11 Setup">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Setup</b>Four steps
            </div>
            <h2 className="h-l">Live in an afternoon.</h2>
          </div>
          <div className="nwf-setup">
            {SETUP.map(([n, t, b]) => (
              <div key={n}>
                <span className="n">{n}</span>
                <b>{t}</b>
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>









      <KeepGoing
        id="start"
        title="Start with New World."
        body="Free to start. Business when you charge."
        primary={{ href: START_HREF, label: 'Use New World →' }}
        secondary={{ href: '/themes', label: 'See every theme' }}
      />
    </div>
  )
}
