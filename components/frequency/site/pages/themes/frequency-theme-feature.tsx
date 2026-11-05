// /themes/bold and /themes/wildheart: the feature page for Bold and Wildheart, on Nocturne's layout
// (frequency-new-world.tsx is the template): the theme's name large with the buttons left and the preview right, the four surfaces
// joined by a dotted line, then Today, Try it on, Inside the kit, Make it yours, Starter kits, What carries over, Built right,
// Questions and Setup. Server component; the one client island is the preview stage (theme-feature-preview.tsx). Every picture is a
// render of the theme's own surfaces (public/brand/theme-pages, made by scripts/render/theme-pages-shots.render.tsx): the real
// site chrome and blocks, the real Spotlight shell on the theme's preset, a Space inside the real member shell (only the Space area
// wears the theme's faces and accent, ADR-1906) and the real campaign mail. Copy follows docs/marketing/voice-and-language-guide.md.
// Styles: new-world-feature.css, tokens only.
import Link from 'next/link'
import { Fragment } from 'react'
import { FreeSpotlightButton } from '@/components/marketing/free-spotlight-button'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import '@/app/themes/active/site-pages-b'
import { createSpaceHref } from '@/lib/create-space/href'
import { KIT_INDEX, PROFILE_KIT_INDEX, SERVICES_KIT_INDEX, CYBERWITCH_KIT_INDEX } from '@/lib/sites/kits/registry'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { THEME_LOOK_CONTROLS, THEME_TOOLS } from '@/lib/themes/library'
import { THEME_FEATURES, themeFeatureShot, type ThemeFeatureId, type ThemeFeatureSurface } from '@/lib/themes/theme-feature-data'
import { NewWorldBrowser, NewWorldPhone } from './new-world-preview'
import { ThemeFeatureMail, ThemeFeatureStage } from './theme-feature-preview'
import { CyberWitchThemeFeature } from './cyberwitch-feature'
const PAGES: [string, string][] = [
  ['Home', 'What happens here, who it is for and a way to come along. The first thing people see.'],
  ['Services', 'Every offer with its length, price and a button. Free first visits are written as Free.'],
  ['Events', 'Dated gatherings with seats people can save, as a list or a calendar.'],
  ['Book', 'Pick a time without a phone call. Pulls from your booking tool.'],
  ['Join', 'Memberships and plans with member pricing, pause and change.'],
  ['About', 'Who is behind it, in your words, with the same face and accent as everywhere else.'],
]
const BUILT: [string, string, string][] = [
  ['Color', 'Contrast-checked color', 'Buttons, links and labels are checked against their grounds, so they read.'],
  ['Input', 'Keyboard and screen readers', 'Every button, tab, menu and form across all four surfaces is reachable, focusable and labelled.'],
  ['Email', 'Survives real inboxes', 'The emails are built in tables with inline styles and email-safe fallbacks for the display face.'],
  ['Data', 'Your people stay yours', 'Sign-ups, bookings and check-ins land in your contacts. Export them any time.'],
]
const SETUP: [string, string, string][] = [
  ['01', 'Choose a kit', 'Pick the closest fit. The preview shows how it reads.'],
  ['02', 'Name and tools', 'Keep the kit’s tools or add more: booking, events, membership, a shop.'],
  ['03', 'Your look', 'Your accent, your fonts, your corners and spacing.'],
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
]

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

function Status() {
  return <small className="nwf-st ready">Ready</small>
}

export function FrequencyThemeFeature({ theme }: { theme: ThemeFeatureId }) {
  // CyberWitch wears its own theme page (the owner's call, 2026-11-05); every other theme keeps Nocturne's layout.
  if (theme === 'cyberwitch') return <CyberWitchThemeFeature />
  const copy = THEME_FEATURES[theme]
  const name = copy.name
  const START_HREF = createSpaceHref(theme)
  const editor = MEGA_THEMES.find((m) => m.id === theme)?.editor
  const kits = [...KIT_INDEX, ...PROFILE_KIT_INDEX, ...SERVICES_KIT_INDEX, ...CYBERWITCH_KIT_INDEX].filter((k) => k.theme === editor)
  const places: { n: string; name: string; qual?: string; surface: ThemeFeatureSurface; body: string; lives: string; wears: string; changes: string }[] = [
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
  const shotFor = (s: ThemeFeatureSurface) => themeFeatureShot(theme, s === 'spotlight' ? 'spot' : s === 'space' ? 'spacedesk' : s === 'email' ? 'email' : 'site')

  return (
    <div className="nwf" style={vars({ '--c': copy.accentVar })}>
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
            <span aria-current="page">{name}</span>
          </nav>
          <div className="nwf-split">
            <div className="nwf-top">
              <div className="label">
                <b>Theme</b>{name} · by Frequency
              </div>
              <h1 className="nwf-h1 nwf-name" style={vars({ '--nwf-chars': name.length })}>
                {name}
              </h1>
              <p className="nwf-aft">A Frequency Theme</p>
              <p className="nwf-tagline">
                {copy.tagline[0]}
                <br />
                <em className="fq-iri-text">{copy.tagline[1]}</em>
              </p>
              <p className="nwf-lead">{copy.lead}</p>
              <div className="ctas">
                <a className="btn fq-iri-btn" href={START_HREF}>
                  Use {name}
                </a>
                <a className="btn btn-ghost fq-iri-rim" href="#preview">
                  See it on every surface
                </a>
                <FreeSpotlightButton surface="theme" detail={theme} />
              </div>
            </div>
            <div className="nwf-hero-shot">
              <ThemeFeatureStage theme={theme} name={name} priority />
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
                    <NewWorldPhone src={shotFor(p.surface)} alt={`${name}: ${p.name.toLowerCase()}`} sizes="(max-width: 900px) 60vw, 300px" />
                  ) : p.surface === 'site' ? (
                    <NewWorldBrowser src={shotFor(p.surface)} alt={`${name}: ${p.name.toLowerCase()}`} url="yourplace.com" width={1280} height={800} sizes="(max-width: 900px) 92vw, 640px" />
                  ) : p.surface === 'space' ? (
                    <NewWorldBrowser src={shotFor(p.surface)} alt={`${name}: space`} url="frequency.com/spaces/yourplace" width={1280} height={770} sizes="(max-width: 900px) 92vw, 640px" />
                  ) : (
                    <ThemeFeatureMail src={shotFor(p.surface)} alt={`${name}: email`} sizes="(max-width: 900px) 70vw, 380px" />
                  )}
                </div>
                <div className="nwf-cz-tx">
                  <span className="jn">{p.n}</span>
                  <h3>
                    {p.name}
                    {p.qual ? <small className="nwf-q">{p.qual}</small> : null}
                    <Status />
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
              <b>Try it on</b>Switch surfaces
            </div>
            <h2 className="h-l">Try it on before you choose.</h2>
            <p className="nwf-sh-p">Switch surfaces. Every picture is the {name} theme reading one profile.</p>
          </div>
          <div className="nwf-try">
            <ThemeFeatureStage theme={theme} name={name} />
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
            <p className="nwf-sh-p">Every kit is a complete site, not a template: pages and the tools behind them, all wearing one look.</p>
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
        </div>
      </section>

      <section className="sec pb-sec" id="yours" data-screen-label="06 Make it yours">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Make it yours</b>Keep the kit, change the look
            </div>
            <h2 className="h-l">Your accent. Your fonts. Your corners.</h2>
            <p className="nwf-sh-p">
              {copy.signature} Change the look from your editor and every surface that wears the theme follows. Your Space page stays the
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

      <section className="sec pb-sec" id="kits" data-screen-label="07 Starter kits">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Starter kits</b>Each tuned to one kind of place
            </div>
            <h2 className="h-l">
              Start from the one that <em className="fq-iri-text">sounds like you.</em>
            </h2>
          </div>
          <div className="nwf-cards">
            {kits.map((k) => (
              <a className="nwf-card" key={k.id} href={START_HREF}>
                <h3>{k.label}</h3>
                <p>{k.description}</p>
              </a>
            ))}
          </div>
          <p className="nwf-sh-p">Every kit wears the same {name} look and is written for a different kind of place. Switch kits any time; your words, offers and dates stay.</p>
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
            {copy.faq.map(([q, a], i) => (
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
        title={`Start with ${name}.`}
        body="Free to start. Business when you charge."
        primary={{ href: START_HREF, label: `Use ${name} →` }}
        secondary={{ href: '/themes', label: 'See every theme' }}
      />
    </div>
  )
}
