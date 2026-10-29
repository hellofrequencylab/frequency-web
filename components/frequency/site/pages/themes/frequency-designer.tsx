// /themes/designer (LIVE-1743): the feature page for the Designer Theme Kit, set up the way Nocturne's is
// (frequency-midnight.tsx) and built from the Theme Feature Page of the Designer design system
// (docs/design-systems/designer). Server component; the one client island is the preview stage
// (designer-preview.tsx). Every picture is a render of the design's own kit surfaces under
// public/themes/designer. What is ready and what is on the way is read from the theme library catalog
// (lib/themes/library.ts), so the page never says more than the product does. The design page's research
// figures and its Nocturne-only lines (accent ramps tuned to black and bone) are left out on purpose.
// Copy follows docs/marketing/voice-and-language-guide.md. Styles: designer-feature.css, tokens only.
import Image from 'next/image'
import Link from 'next/link'
import { Fragment } from 'react'
import { FreeSpotlightButton } from '@/components/marketing/free-spotlight-button'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import '@/app/themes/active/site-pages-b'
import { THEME_LOOK_CONTROLS, THEME_TOOLS, themeLibraryEntry } from '@/lib/themes/library'
import {
  DESIGNER_DEFAULT_KIT,
  DESIGNER_KITS,
  DESIGNER_LAYOUTS,
  DESIGNER_SPOTLIGHT_EYEBROW,
  designerLayoutShot,
  designerShot,
  type DesignerSurface,
} from '@/lib/themes/designer-feature-data'
import { DesignerBrowser, DesignerMail, DesignerPhone, DesignerStage, type DesignerSurfaceStatus } from './designer-preview'

const START_HREF = '/spaces/new?theme=designer'

const PAGES: [string, string][] = [
  ['Home', 'Hero, ways in, proof and a closing call. Blocks switch on with the kit’s tools.'],
  ['Offerings', 'Every offer with its length, price and a button. Pulls from your booking tool.'],
  ['Gatherings', 'Dated events with seats, tickets and waitlists, as a list or a calendar.'],
  ['Programs', 'Programs with a start date, an outline and one promised result.'],
  ['Shop', 'Products, downloads and gift cards with checkout on your domain.'],
  ['Membership', 'Up to three tiers, yearly pricing, pause and resume.'],
  ['Library', 'Guides and posts, free or paid, with the letter sign-up beside them.'],
  ['About', 'Who you are, in your words, with the same face and accent as everywhere else.'],
]
const EMAILS: [string, string][] = [
  ['The note', 'What is on, one offer, a word from someone.'],
  ['Welcome', 'What to expect and three ways in.'],
  ['The dates', 'Everything on the calendar, pulled from your events.'],
  ['The receipt', 'When, where and what was paid.'],
]
const BUILT: [string, string, string][] = [
  ['Color', 'Contrast-checked color', 'Every accent is checked so buttons, links and labels meet contrast guidelines out of the box.'],
  ['Input', 'Keyboard and screen readers', 'Every button, tab, menu and form across all four surfaces is reachable, focusable and labelled.'],
  ['Email', 'Survives real inboxes', 'Templates are built in tables with inline styles and email-safe fallbacks for your display face.'],
  ['Data', 'Your people stay yours', 'Sign-ups, bookings and check-ins land in your contacts. Export them any time.'],
]
const SETUP: [string, string, string][] = [
  ['01', 'Choose a kit', 'Pick the closest of the thirteen. The preview updates as you choose.'],
  ['02', 'Name and tools', 'Keep the kit’s tools or add more: events, programs, membership, one-to-ones, shop.'],
  ['03', 'Your look', 'Keep the kit’s accent and fonts or use your own. Set corners, spacing and header.'],
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
  ['Spotlight', 'Books and sells on the page'],
  ['Space', 'Found on the network, wearing your look'],
  ['Website', 'Your own domain, same blocks'],
  ['Email', 'Your list, in the same look, on the way'],
  ['One profile', 'One login, one list, one look'],
]

const CARRY: { row: string; cells: (string | true)[] }[] = [
  { row: 'Name and mark', cells: [true, true, true, true] },
  { row: 'Fonts and accent', cells: [true, 'On Frequency’s frame', true, true] },
  { row: 'Offers, dates and prices', cells: [true, true, true, 'The next few'] },
  { row: 'Headline and copy', cells: [true, 'Tagline', true, 'Opening line'] },
  { row: 'Main button', cells: [true, true, true, true] },
  { row: 'Accessible colour and controls', cells: [true, true, true, true] },
]

const FAQ: [string, string][] = [
  ['Can I start with only a Spotlight?', 'Yes. Most people do. Your Space and website use the same profile, so they are ready when you are, with nothing to rewrite.'],
  ['Will my Space look exactly like my website?', 'Your Space keeps Frequency’s page frame, so people on the network always know where they are. It wears your name, fonts, accent and offers, so it reads as you.'],
  ['Do I have to use every tool?', 'No. A kit starts with two or three. Switch on the rest from Menu and features when you are ready, and nothing is lost when you do.'],
  ['What happens if I change my mind about the look?', 'Press Change theme in your editor. Your words, offers and photos stay saved. Designer is only the dress they wear.'],
  ['Who owns my contacts?', 'You do. Sign-ups, bookings and check-ins build your list, and your list stays yours.'],
  ['What does it cost?', 'Free to start. Business when you charge.'],
]

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

function Status({ s }: { s: DesignerSurfaceStatus }) {
  return <small className={`df-st ${s}`}>{s === 'ready' ? 'Ready' : 'On the way'}</small>
}

export function FrequencyDesigner() {
  const entry = themeLibraryEntry('designer')
  if (!entry) return null
  const statusOf = (id: string) => entry.surfaces.find((s) => s.id === id)?.status ?? 'soon'
  const status: Record<DesignerSurface, DesignerSurfaceStatus> = {
    site: statusOf('website'),
    spotlight: statusOf('spotlight'),
    space: statusOf('space'),
    email: statusOf('email'),
  }
  const kit = DESIGNER_DEFAULT_KIT
  const places: { n: string; name: string; qual?: string; surface: DesignerSurface; body: string; lives: string; wears: string; changes: string }[] = [
    {
      n: '01 · Day one',
      name: 'Spotlight',
      qual: 'Link Page',
      surface: 'spotlight',
      body: 'Your link-in-bio page. The same hero, doors and featured offer your website opens with.',
      lives: 'Its own Spotlight link',
      wears: 'The full theme',
      changes: 'Your bio link sells something on the first tap.',
    },
    {
      n: '02 · On the network',
      name: 'Space',
      qual: 'Profile',
      surface: 'space',
      body: 'Your page on Frequency, where your town finds you. Frequency keeps its frame; the page wears your fonts, your accent and your offers.',
      lives: 'frequency.com/spaces/yourstudio',
      wears: 'Frequency, with your fonts and accent',
      changes: 'You are found by people already looking.',
    },
    {
      n: '03 · Your own domain',
      name: 'Website',
      surface: 'site',
      body: 'Booking, events, programs, membership and a shop as you need them. Built from the same blocks, so nothing is written twice.',
      lives: 'yourstudio.com',
      wears: 'The full theme',
      changes: 'A complete site, without starting again.',
    },
    {
      n: '04 · In the inbox',
      name: 'Email template',
      surface: 'email',
      body: 'Templates that wear your mark, face and accent: the weekly note, a welcome, the next few dates and a booking receipt. Dates, offers and names fill in from the same profile.',
      lives: 'Your subscribers’ inbox',
      wears: 'the theme, in tables that survive email clients',
      changes: 'Your list hears from you, and it looks like you.',
    },
  ]
  const shotFor = (s: DesignerSurface) => (s === 'spotlight' ? designerShot(kit, 'spot') : s === 'space' ? designerShot(kit, 'spacedesk') : s === 'email' ? designerShot(kit, 'email') : designerShot(kit, 'site'))

  return (
    <div className="df" style={vars({ '--c': 'var(--fq-x-sun-neon)' })}>
      <section className="phero big df-hero" data-energy="flow" data-screen-label="01 Hero">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.35 })} />
        <div className="fq-grain" />
        <div className="df-wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/spaces">For Spaces</Link>
            <span aria-hidden="true">/</span>
            <Link href="/themes">Themes</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Designer</span>
          </nav>
          <div className="df-split">
            <div className="df-top">
              <div className="label">
                <b>Theme Kit</b>Designer · by Frequency
              </div>
              <h1 className="df-h1 df-name">Designer</h1>
              <p className="df-aft">A Frequency Theme</p>
              <p className="df-tagline">
                Design it once.
                <br />
                <em className="fq-iri-text">Same theme everywhere.</em>
              </p>
              <p className="df-lead">
                Your link in bio, your Space, your website and your emails each look a little different. The Designer Theme Kit gives studios,
                interiors, architecture, gardens and brands one look to wear on all of them, read from one profile. Change it once and the surfaces
                marked ready follow.
              </p>
              <div className="ctas">
                <a className="btn fq-iri-btn" href={START_HREF}>
                  Use Designer
                </a>
                <a className="btn btn-ghost fq-iri-rim" href="#preview">
                  See it on every surface
                </a>
                <FreeSpotlightButton surface="theme" detail="designer" />
              </div>
            </div>
            <div className="df-hero-shot">
              <DesignerBrowser src={shotFor('site')} alt="Designer: website" url="yourstudio.com" width={1280} height={800} sizes="(max-width: 900px) 92vw, 640px" priority />
            </div>
          </div>
          <a className="df-more" href="#why">
            <span>Where a design studio lives online</span>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <div className="df-cascade" id="places">
            {places.map((p, i) => (
              <Fragment key={p.name}>
                {i > 0 ? (
                  <svg className={`df-thread ${i % 2 ? 'lr' : 'rl'}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <path d={i % 2 ? 'M 24 0 C 24 55, 76 45, 76 100' : 'M 76 0 C 76 55, 24 45, 24 100'} vectorEffect="non-scaling-stroke" />
                  </svg>
                ) : null}
              <div className={`df-cz ${i % 2 ? 'r' : 'l'}`}>
                <div className="df-cz-dev">
                  <span className="df-dvlab">{p.qual ? `${p.name} · ${p.qual}` : p.name}</span>
                  {p.surface === 'spotlight' ? (
                    <DesignerPhone src={shotFor(p.surface)} alt={`Designer: ${p.name.toLowerCase()}`} sizes="(max-width: 900px) 60vw, 300px" />
                  ) : p.surface === 'email' ? (
                    <DesignerMail src={shotFor(p.surface)} alt="Designer: email" sizes="(max-width: 900px) 70vw, 380px" />
                  ) : (
                    <DesignerBrowser
                      src={shotFor(p.surface)}
                      alt={`Designer: ${p.name.toLowerCase()}`}
                      url={p.surface === 'site' ? 'yourstudio.com' : 'frequency.com/spaces/yourstudio'}
                      width={1280}
                      height={p.surface === 'site' ? 800 : 770}
                      sizes="(max-width: 900px) 92vw, 640px"
                    />
                  )}
                </div>
                <div className="df-cz-tx">
                  <span className="jn">{p.n}</span>
                  <h3>
                    {p.name}
                    {p.qual ? <small className="df-q">{p.qual}</small> : null}
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
                  <p className="df-out">
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
              <b>Today</b>Where a design studio lives online
            </div>
            <h2 className="h-l">Five tools. Five logins. Five versions of you.</h2>
          </div>
          <div className="df-stack">
            <div className="df-st-card before">
              <span className="label">Before · five tools</span>
              {BEFORE.map(([a, b]) => (
                <div className="df-row" key={a}>
                  <span>
                    <i />
                    {a}
                  </span>
                  <em>{b}</em>
                </div>
              ))}
              <p className="df-st-p">
                Each one is fine on its own. Together they drift: a price changes in one place and not the others, and every hand-off is a place to
                lose someone.
              </p>
            </div>
            <span className="df-arrow" aria-hidden="true">
              →
            </span>
            <div className="df-st-card after">
              <span className="label">With a Theme Kit · one profile</span>
              {AFTER.map(([a, b]) => (
                <div className="df-row" key={a}>
                  <span>
                    <i />
                    {a}
                  </span>
                  <em>{b}</em>
                </div>
              ))}
              <p className="df-st-p">
                Change a price, a date or a headline once. The surfaces marked ready follow, and everyone who signs up lands in the same list.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="preview" data-screen-label="04 Theme preview">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Thirteen profiles</b>Each tuned to one kind of designer
            </div>
            <h2 className="h-l">Try it on before you choose.</h2>
            <p className="df-sh-p">Pick a profile. Switch surfaces. Every picture is the Designer design reading one profile.</p>
          </div>
          <div className="df-try">
            <DesignerStage kits status={status} />
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
            <p className="df-sh-p">Every kit is a complete site, not a template: pages, the tools behind them, four emails, and Spotlight layouts, all wearing one look.</p>
          </div>
          <h3 className="df-grp">Pages</h3>
          <div className="df-cards">
            {PAGES.map(([name, body]) => (
              <div className="df-card" key={name}>
                <h3>{name}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
          <h3 className="df-grp">Tools</h3>
          <div className="df-cards">
            {THEME_TOOLS.map((t) => (
              <div className="df-card" key={t.name}>
                <h3>{t.name}</h3>
                <p>{t.body}</p>
              </div>
            ))}
          </div>
          <h3 className="df-grp">Emails</h3>
          <div className="df-cards">
            {EMAILS.map(([name, body]) => (
              <div className="df-card" key={name}>
                <h3>{name}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
          <div id="layouts">
            <h3 className="df-grp">{DESIGNER_SPOTLIGHT_EYEBROW}</h3>
          <div className="df-layouts">
            {DESIGNER_LAYOUTS.map((l, i) => (
              <figure key={l.id}>
                <DesignerPhone src={designerLayoutShot(l.id)} alt={`Designer Spotlight layout: ${l.name}`} sizes="(max-width: 900px) 44vw, 200px" />
                <figcaption>
                  <b>
                    <span>{`0${i + 1}`}</span>
                    {l.name}
                  </b>
                  <small>{l.sub}</small>
                </figcaption>
              </figure>
            ))}
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
            <p className="df-sh-p">
              {entry.signature} Change the look from your editor and every surface that wears the theme follows. Your Space page stays the
              Frequency page people know, wearing your fonts and accent.
            </p>
          </div>
          <div className="df-cards">
            {THEME_LOOK_CONTROLS.map((c) => (
              <div className="df-card" key={c.name}>
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
              <b>Thirteen kits</b>Each tuned to one kind of studio
            </div>
            <h2 className="h-l">
              See it. Preview it. <em className="fq-iri-text">Make it yours.</em>
            </h2>
          </div>
          <div className="df-kgrid">
            {DESIGNER_KITS.map((k) => (
              <a className="df-kit" key={k.id} href={`/spaces/new?niche=${k.id}&theme=designer`} style={vars({ '--c': k.hex })}>
                <Image src={designerShot(k.id, 'site')} alt={`Designer, ${k.name}: website`} width={1280} height={800} sizes="(max-width: 900px) 46vw, 280px" />
                <span>
                  <i />
                  <b>{k.name}</b>
                  <small>{k.who}</small>
                </span>
              </a>
            ))}
          </div>
          <p className="df-sh-p">Every picture is the real kit. Switch kits any time; your words, offers and dates stay.</p>
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
          <div className="df-cmp" role="table" aria-label="What carries to each surface">
            <div className="hd" />
            <div className="hd">Spotlight</div>
            <div className="hd">Space</div>
            <div className="hd">Website</div>
            <div className="hd">Email</div>
            {CARRY.map((r) => (
              <div className="df-cmp-row" key={r.row}>
                <div className="rw">{r.row}</div>
                {r.cells.map((c, i) =>
                  c === true ? (
                    <div className="y" key={i}>
                      <span className="vh">Carries in full</span>
                    </div>
                  ) : (
                    <div className="p" key={i}>
                      <span>{c}</span>
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
          <p className="df-legend">
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
          <div className="df-setup">
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
          <div className="df-faq">
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
          <div className="df-setup">
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
        title="Start with Designer."
        body="Free to start. Business when you charge."
        primary={{ href: START_HREF, label: 'Use Designer →' }}
        secondary={{ href: '/themes', label: 'See every theme' }}
      />
    </div>
  )
}
