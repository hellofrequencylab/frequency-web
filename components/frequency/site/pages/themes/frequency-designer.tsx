'use client'

// /themes/designer (LIVE-1743, rebuilt LIVE-1753): the feature page for the Designer Theme Kit, built section by section
// from the Theme Feature Page of the Designer design system (docs/design-systems/designer), in the same order and the same
// shapes as /themes/nocturne (frequency-midnight.tsx). Every picture is a render of the design's own kit surfaces under
// public/themes/designer/shots, ids as in lib/themes/designer-feature-data.ts. Every button goes to a real route: the Wizard
// (/spaces/new?niche=<kit>&theme=designer), pricing, or an anchor on this page. The design page's research figures and its
// Nocturne-only lines are left out on purpose (docs/marketing/voice-and-language-guide.md).
// Styles: nocturne-feature.css (the shared page frame, tokens only) and designer-feature.css (Designer's own deltas).
import Image from 'next/image'
import Link from 'next/link'
import { Fragment, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { themeLibraryEntry } from '@/lib/themes/library'
import '@/app/themes/active/site-pages-b'
import './nocturne-feature.css'
import './designer-feature.css'
import { DESIGNER_BLOCKS, DESIGNER_KITS, DESIGNER_PACKAGES, DESIGNER_SWATCHES, type DesignerKit } from '@/lib/themes/designer-feature-data'

type Surface = 'site' | 'spacedesk' | 'spotlight' | 'email'
type Shot = 'site' | 'spacedesk' | 'space' | 'spot' | 'email'
type Mail = 'note' | 'welcome' | 'dates' | 'receipt'

const KIT_BY_ID = Object.fromEntries(DESIGNER_KITS.map((k) => [k.id, k]))
const SHOT_DIM: Record<Shot, [number, number]> = {
  site: [1280, 800],
  spacedesk: [1280, 770],
  space: [740, 1648],
  spot: [740, 1648],
  email: [900, 1140],
}
const SURFACE_SHOT: Record<Surface, Shot> = {
  site: 'site',
  spacedesk: 'spacedesk',
  spotlight: 'spot',
  email: 'email',
}
const SURFACE_LABEL: Record<Surface, string> = {
  site: 'Website',
  spacedesk: 'Space',
  spotlight: 'Spotlight',
  email: 'Email',
}
const SURFACES: Surface[] = ['site', 'spacedesk', 'spotlight', 'email']
/** The id each preview surface has in the theme library catalog (lib/themes/library.ts). */
const LIB_ID: Record<Surface, string> = { site: 'website', spacedesk: 'space', spotlight: 'spotlight', email: 'email' }
const MAILS: [Mail, string][] = [
  ['note', 'The note'],
  ['welcome', 'Welcome'],
  ['dates', 'The dates'],
  ['receipt', 'Receipt'],
]

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}
function shotSrc(kit: string, shot: Shot, mail: Mail = 'note') {
  return `/themes/designer/shots/${kit}-${shot}${shot === 'email' && mail !== 'note' ? `-${mail}` : ''}.jpg`
}
function adoptHref(kit: string) {
  return `/spaces/new?niche=${kit}&theme=designer`
}
function pad(n: number) {
  return String(n).padStart(2, '0')
}

function Shot({ kit, shot, label, priority = false, sizes, mail = 'note' }: { kit: DesignerKit; shot: Shot; label: string; priority?: boolean; sizes: string; mail?: Mail }) {
  const [w, h] = SHOT_DIM[shot]
  return <Image src={shotSrc(kit.id, shot, mail)} alt={`${kit.name}: ${label}`} width={w} height={h} sizes={sizes} priority={priority} />
}

/** An iPhone: bezel, status bar with the island, and the home bar around a 370 by 824 screen of the kit (the design system's ios frame). */
function Phone({ kit, shot, label, tone, priority, sizes }: { kit: DesignerKit; shot: 'spot' | 'space'; label: string; tone: 'dark' | 'light'; priority?: boolean; sizes: string }) {
  return (
    <span className="nf-ios" data-tone={tone}>
      <span className="nf-ios-scr">
        <Shot kit={kit} shot={shot} label={label} priority={priority} sizes={sizes} />
        <span className="nf-sb" aria-hidden="true">
          <span>9:41</span>
          <span className="nf-isl" />
          <span className="nf-sbi">
            <i />
            <i />
            <i />
          </span>
        </span>
        <span className="nf-hi" aria-hidden="true" />
      </span>
    </span>
  )
}

/** One device frame around a kit screenshot. */
function Device({ kit, surface, priority, sizes, mail = 'note' }: { kit: DesignerKit; surface: Surface; priority?: boolean; sizes: string; mail?: Mail }) {
  const shot = SURFACE_SHOT[surface]
  const label = SURFACE_LABEL[surface]
  if (shot === 'spot') {
    return (
      <div className="nf-dv nf-dv-spot">
        <Phone kit={kit} shot="spot" label={label} tone="dark" priority={priority} sizes={sizes} />
      </div>
    )
  }
  const browser = shot === 'site' || shot === 'spacedesk'
  return (
    <div className={`nf-dv nf-dv-${shot}`}>
      {browser ? (
        <div className="nf-bar" aria-hidden="true">
          <i />
          <i />
          <i />
          <u>{shot === 'site' ? 'yourstudio.com' : 'frequency.com/spaces/yourstudio'}</u>
        </div>
      ) : null}
      <div className="nf-scr">
        <Shot kit={kit} shot={shot} label={label} priority={priority} sizes={sizes} mail={mail} />
      </div>
    </div>
  )
}

const CASCADE: {
  n: string
  name: string
  surface: Surface
  tag: string
  body: string
  lives: string
  wears: string
  changes: string
  button: string
}[] = [
  {
    n: '01 · Day one',
    name: 'Spotlight',
    surface: 'spotlight',
    tag: 'Spotlight (Link Page)',
    body: 'Your link-in-bio page. The same hero, doors and featured offer your website opens with.',
    lives: 'Its own Spotlight link',
    wears: 'the full theme',
    changes: 'Your bio link sells something on the first tap.',
    button: 'Preview Spotlight',
  },
  {
    n: '02 · On the network',
    name: 'Space',
    surface: 'spacedesk',
    tag: 'Space (Profile)',
    body: 'Your page on Frequency, where your town finds you. Frequency keeps its frame; the page wears your fonts, your accent and your offers.',
    lives: 'frequency.com/spaces/yourstudio',
    wears: 'Frequency, with your fonts and accent',
    changes: 'You are found by people already looking.',
    button: 'Preview Space',
  },
  {
    n: '03 · Your own domain',
    name: 'Website',
    surface: 'site',
    tag: 'Website',
    body: 'Booking, events, programs, membership and a shop as you need them. Built from the same blocks, so nothing is written twice.',
    lives: 'yourstudio.com',
    wears: 'the full theme',
    changes: 'A complete site, without starting again.',
    button: 'Preview website',
  },
  {
    n: '04 · In the inbox',
    name: 'Email',
    surface: 'email',
    tag: 'Email',
    body: 'Four templates that wear your mark, face and accent: the weekly note, a welcome, the next few dates and a booking receipt. Dates, offers and names fill in from the same profile.',
    lives: 'Your subscribers’ inbox',
    wears: 'the theme, in tables that survive email clients',
    changes: 'Your list hears from you, and it looks like you.',
    button: 'Preview email',
  },
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
  ['Email', 'Four templates, your list, your face'],
  ['One profile', 'One login, one list, one look'],
]

type InsView = 'pages' | 'blocks' | 'tools' | 'emails' | 'look'
const PAGES: [string, string, string][] = [
  ['Home', 'Hero, ways in, proof and a closing call. Blocks switch on with the kit’s tools.', 'core'],
  ['Offerings', 'Every service with length, price and a book button. Pulls from your booking tool.', 'book'],
  ['Book', 'Pick a time, answer intake, pay a deposit. Confirmation lands in the inbox.', 'book'],
  ['Gatherings', 'Dated events with seats, tickets and waitlists, as a list or a calendar.', 'gather'],
  ['Journeys', 'Cohort programs with a start date, weekly outline and one promised result.', 'learn'],
  ['Shop', 'Products, downloads and gift cards with checkout on your domain.', 'sell'],
  ['Membership', 'Up to three tiers, yearly pricing, pause and resume.', 'belong'],
  ['Library', 'Guides and posts, free or paid, with the letter sign-up beside them.', 'publish'],
  ['About', 'Who you are, in your words, with the same face and accent as everywhere else.', 'core'],
]
const EMAILS: [string, string, string][] = [
  ['The note', 'Most weeks', 'What is on this week, one offer, a word from someone.'],
  ['Welcome', 'On sign-up', 'What to expect and three ways in.'],
  ['The dates', 'Before the month', 'Everything on the calendar, pulled from your events.'],
  ['The receipt', 'After booking', 'When, where and what was paid.'],
]
const INS_NAV: { id: InsView; n: number; label: string }[] = [
  { id: 'pages', n: PAGES.length, label: 'Pages' },
  { id: 'blocks', n: DESIGNER_BLOCKS.length, label: 'Home blocks' },
  { id: 'tools', n: DESIGNER_PACKAGES.length, label: 'Tools' },
  { id: 'emails', n: EMAILS.length, label: 'Email templates' },
  { id: 'look', n: DESIGNER_KITS.length, label: 'Looks' },
]

const CARRY: { row: string; cells: (string | true)[] }[] = [
  { row: 'Name and mark', cells: [true, true, true, true] },
  {
    row: 'Fonts and accent',
    cells: [true, 'On Frequency’s frame', true, true],
  },
  {
    row: 'Offers, dates and prices',
    cells: [true, true, true, 'The next few'],
  },
  { row: 'Headline and copy', cells: [true, 'Tagline', true, 'Opening line'] },
  { row: 'Main button', cells: [true, true, true, true] },
  { row: 'Accessible colour and controls', cells: [true, true, true, true] },
]

const BUILT: { n: string; title: string; body: string }[] = [
  {
    n: 'Colour',
    title: 'Contrast-checked ramps',
    body: 'Thirteen accent ramps, each checked for contrast on its own ground. Buttons, links and labels meet contrast guidelines out of the box.',
  },
  {
    n: 'Input',
    title: 'Keyboard and screen readers',
    body: 'Every button, tab, menu and form across all four surfaces is reachable, focusable and labelled.',
  },
  {
    n: 'Email',
    title: 'Survives real inboxes',
    body: 'Templates are built in tables with inline styles and email-safe fallbacks for your display face.',
  },
  {
    n: 'Data',
    title: 'Your people stay yours',
    body: 'Sign-ups, bookings and check-ins land in your contacts. Export them any time.',
  },
]

const FAQ: [string, string][] = [
  [
    'Can I start with only a Spotlight?',
    'Yes. Most people do. Your Space and website use the same profile, so they are ready when you are, with nothing to rewrite.',
  ],
  [
    'Will my Space look exactly like my website?',
    'Your Space keeps Frequency’s page frame, so people on the network always know where they are. It wears your name, fonts, accent and offers, so it reads as you.',
  ],
  [
    'Do I need every tool on day one?',
    'No. Each kit starts with two to four. Turn on booking, events, programs, membership or the shop when you are ready to run them.',
  ],
  [
    'What happens to my content if I switch kits?',
    'Tools, block order, look and the kit’s starter words reset to the new kit. Your own text, offers and dates stay saved on their blocks. A block that the new kit hides keeps its content and returns as you left it.',
  ],
  ['Who owns my contacts?', 'You do. Sign-ups, bookings and check-ins build your list, and your list stays yours.'],
  ['What does it cost?', 'Free to start. Business when you charge.'],
]

const SETUP: [string, string, string][] = [
  ['01', 'Choose a kit', 'Pick the closest of the thirteen. The preview updates as you choose.'],
  ['02', 'Name and tools', 'Keep the kit’s tools or add more: booking, events, programs, membership, shop.'],
  ['03', 'Your look', 'Keep the kit’s accent and fonts or use your own. Set corners, spacing and header.'],
  ['04', 'Go live', 'Your Spotlight is live today. Space, website and emails switch on with a Business account, or wait as a draft.'],
]

const ACCENTS = ['', ...DESIGNER_SWATCHES]
const FACES = ['Kit default', 'Instrument Serif', 'Bricolage', 'DM Serif']
const CORNERS = ['Kit default', 'Sharp', 'Soft', 'Round']

function Pressed({
  on,
  children,
  ...rest
}: {
  on: boolean
  children?: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-pressed={on} {...rest}>
      {children}
    </button>
  )
}

export function FrequencyDesigner() {
  const [kitId, setKitId] = useState('general')
  const [hv, setHv] = useState<Surface>('site')
  const [ins, setIns] = useState<InsView>('pages')
  const [mail, setMail] = useState<Mail>('note')
  const [pv, setPv] = useState<{ view: Surface } | null>(null)
  const [kpOpen, setKpOpen] = useState(false)
  const kit = KIT_BY_ID[kitId] ?? DESIGNER_KITS[0]
  const kitIx = DESIGNER_KITS.findIndex((k) => k.id === kit.id)

  const pick = (id: string) => setKitId(id)
  const step = (d: number) => pick(DESIGNER_KITS[(kitIx + d + DESIGNER_KITS.length) % DESIGNER_KITS.length].id)
  const on = (p: string) => p === 'core' || kit.packages.includes(p)
  const pk = (id: string) => DESIGNER_PACKAGES.find((p) => p.id === id)?.name ?? id
  const stageVars = vars({ '--c': kit.hex })
  const soon = (id: string) => (themeLibraryEntry('designer')?.surfaces.find((x) => x.id === id)?.status ?? 'soon') === 'soon'

  return (
    <div className="nf nf-dz" style={stageVars}>
      <section className="phero big nf-hero nf-hz" data-energy="flow" data-screen-label="01 Hero">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.35 })} />
        <div className="fq-grain" />
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/spaces">For Spaces</Link>
            <span aria-hidden="true">/</span>
            <Link href="/themes">Themes</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Designer</span>
          </nav>
          <div className="nf-hz-top">
            <div className="label">
              <b>Theme Kit</b>Designer · by Frequency
            </div>
            <h1 className="nf-hz-h1">
              Design it once.
              <br />
              <em className="fq-iri-text">Same theme everywhere.</em>
            </h1>
            <p className="nf-hz-lead">
              One complete theme for designers who sell their services: studios, interiors, architecture, gardens and brands. Your link in bio,
              your Space on Frequency, your own website and your emails, all reading one profile. Change it once and every surface follows.
            </p>
            <div className="ctas">
              <Link className="btn fq-iri-btn" href={adoptHref(kit.id)}>
                Start your Spotlight
              </Link>
              <a className="btn btn-ghost fq-iri-rim" href="#preview">
                See it live
              </a>
            </div>
          </div>
          <div className="nf-cascade">
            {CASCADE.map((c, i) => (
              <Fragment key={c.name}>
                {i > 0 ? (
                  <svg className={`nf-thread ${i % 2 ? 'lr' : 'rl'}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <path d={i % 2 ? 'M 24 0 C 24 55, 76 45, 76 100' : 'M 76 0 C 76 55, 24 45, 24 100'} vectorEffect="non-scaling-stroke" />
                  </svg>
                ) : null}
                <div className={`nf-cz ${i % 2 ? 'r' : 'l'}`} id={i === 0 ? 'spotlight' : undefined}>
                  <div className="nf-cz-dev">
                    <Device kit={kit} surface={c.surface} priority={i === 0} sizes="(max-width: 900px) 90vw, 560px" mail={mail} />
                  </div>
                  <div className="nf-cz-tx">
                    <span className="jn">{c.n}</span>
                    <h3>
                      {c.tag.replace(/ \(.*\)$/, '')}{' '}
                      {c.tag.includes('(') ? <small className="nf-q">{c.tag.replace(/^.*\(|\)$/g, '')}</small> : null}
                      {soon(LIB_ID[c.surface]) ? <small className="nf-q">On the way</small> : null}
                    </h3>
                    <p>{c.body}</p>
                    {c.surface === 'email' ? (
                      <div className="nf-seg nf-mt" role="group" aria-label="Email template">
                        {MAILS.map(([id, label]) => (
                          <Pressed key={id} on={mail === id} onClick={() => setMail(id)}>
                            {label}
                          </Pressed>
                        ))}
                      </div>
                    ) : null}
                    <ul>
                      <li>
                        <b>Lives at</b>
                        {c.lives}
                      </li>
                      <li>
                        <b>Wears</b>
                        {c.wears}
                      </li>
                    </ul>
                    <p className="nf-out">
                      <b>What changes</b>
                      {c.changes}
                    </p>
                    <button type="button" className="btn btn-ghost fq-iri-rim" onClick={() => setPv({ view: c.surface })}>
                      {c.button}
                    </button>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec nf-part" id="why" data-screen-label="03 Today">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Today</b>Where a design studio lives online
            </div>
            <h2 className="h-l">Five tools. Five logins. Five versions of you.</h2>
          </div>
          <div className="nf-stack">
            <div className="nf-st before">
              <span className="label">Before · five tools</span>
              {BEFORE.map(([a, b]) => (
                <div className="nf-row" key={a}>
                  <span>
                    <i />
                    {a}
                  </span>
                  <em>{b}</em>
                </div>
              ))}
              <p className="nf-st-p">
                Each one is fine on its own. Together they drift: a price changes in one place and not the others, and every hand-off is a place to
                lose someone.
              </p>
            </div>
            <span className="nf-arrow" aria-hidden="true">
              →
            </span>
            <div className="nf-st after">
              <span className="label">With a theme kit · one profile</span>
              {AFTER.map(([a, b]) => (
                <div className="nf-row" key={a}>
                  <span>
                    <i />
                    {a}
                  </span>
                  <em>{b}</em>
                </div>
              ))}
              <p className="nf-st-p">
                Change a price, a date or a headline once. All four surfaces follow, and everyone who signs up lands in the same list.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec pb-sec nf-part" id="preview" data-screen-label="04 Theme preview">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Theme preview</b>See it live
            </div>
            <h2 className="h-l">Try it on before you choose.</h2>
            <p className="nf-sh-p">Pick a kit. Switch surfaces. Every frame is the real theme reading one profile.</p>
          </div>
          <div className="nf-hv">
            <div className="nf-hv-l">
              <div className="nf-seg nf-hv-surf" role="group" aria-label="Surface">
                {SURFACES.map((s) => (
                  <Pressed key={s} on={hv === s} onClick={() => setHv(s)}>
                    {SURFACE_LABEL[s]}
                  </Pressed>
                ))}
              </div>
              <div className="nf-kits-grid" role="group" aria-label="Pick a kit">
                {DESIGNER_KITS.map((k) => (
                  <Pressed key={k.id} on={k.id === kit.id} onClick={() => pick(k.id)} style={vars({ '--c': k.hex })} title={k.who}>
                    <i />
                    {k.name}
                  </Pressed>
                ))}
              </div>
            </div>
            <div className="nf-hv-r">
              <div className="nf-stage">
                <Device kit={kit} surface={hv} sizes="(max-width: 960px) 90vw, 640px" mail={mail} />
                <button type="button" className="btn btn-ghost fq-iri-rim nf-open" onClick={() => setPv({ view: hv })}>
                  Open full preview
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec pb-sec nf-part" id="inside" data-screen-label="05 Inside the kit">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Inside the kit</b>Everything a kit ships with
            </div>
            <h2 className="h-l">More than a homepage.</h2>
            <p className="nf-sh-p">
              Every kit is a complete site, not a template. Pages, home blocks with layout variants, the tools behind them, four emails, and a look
              tuned to the business. Shown here for <b className="nf-strong">{kit.name}</b>.
            </p>
          </div>
          <div className="nf-ins">
            <nav className="nf-ins-nav" aria-label="Inside the kit">
              {INS_NAV.map((t) => (
                <Pressed key={t.id} on={ins === t.id} onClick={() => setIns(t.id)}>
                  <b>{t.n}</b>
                  <span>{t.label}</span>
                </Pressed>
              ))}
            </nav>
            <div className="nf-ins-body">
              {ins === 'look' ? (
                <div className="nf-ins-look">
                  <div
                    className="nf-ic"
                    style={vars({
                      '--lk-display': 'var(--font-dz-cormorant), serif',
                    })}
                  >
                    <div className="k">
                      <span>Type</span>
                      <em>
                        {kit.fonts.display} · {kit.fonts.label}
                      </em>
                    </div>
                    <div className="big">
                      Aa <em>Aa</em>
                    </div>
                    <span>
                      {kit.fonts.display} for headlines, {kit.fonts.label} for labels and body text.
                    </span>
                  </div>
                  <div className="nf-ic">
                    <div className="k">
                      <span>Colour</span>
                      <em>{kit.hex}</em>
                    </div>
                    <div className="nf-sw" aria-hidden="true">
                      <i className="s-night" />
                      <i className="s-bone" />
                      <i className="s-acc" />
                      <i className="s-deep" />
                      <i className="s-pale" />
                    </div>
                    <span>Dark, light and one accent ramp, checked for contrast on both grounds.</span>
                  </div>
                  <div className="nf-ic">
                    <div className="k">
                      <span>Shape</span>
                    </div>
                    <b className="nf-cap">
                      {kit.look.corners} corners · {kit.look.spacing} spacing
                    </b>
                    <span>
                      Header: {kit.look.header}. Footer: {kit.look.footer}. Set per kit, changeable per site.
                    </span>
                  </div>
                  <div className="nf-ic">
                    <div className="k">
                      <span>Voice</span>
                    </div>
                    <b>
                      {kit.hero.title} <em className="nf-em">{kit.hero.em}</em>
                    </b>
                    <span>{kit.who}</span>
                  </div>
                </div>
              ) : (
                <div className="nf-ins-grid">
                  {ins === 'pages' &&
                    PAGES.map(([n, t, p]) => (
                      <div className={`nf-ic${on(p) ? '' : ' off'}`} key={n}>
                        <div className="k">
                          <span>{p === 'core' ? 'Always on' : pk(p)}</span>
                          {on(p) ? <em>In this kit</em> : null}
                        </div>
                        <b>{n}</b>
                        <span>{t}</span>
                      </div>
                    ))}
                  {ins === 'blocks' &&
                    DESIGNER_BLOCKS.map((b) => {
                      const inKit = kit.blocks.includes(b.id)
                      const lay = kit.layouts[b.id]
                      return (
                        <div className={`nf-ic${inKit ? '' : ' off'}`} key={b.id}>
                          <div className="k">
                            <span>{b.stage}</span>
                            {inKit ? <em>{lay ? `${lay} layout` : 'On'}</em> : null}
                          </div>
                          <b>{b.name}</b>
                          <span>
                            {b.pkg === 'core' ? 'Needs no tool.' : `Appears when ${pk(b.pkg)} is on.`}
                            {lay ? ` Shown as ${lay}${b.pkg === 'core' ? ' in this kit' : ''}.` : ''}
                          </span>
                        </div>
                      )
                    })}
                  {ins === 'tools' &&
                    DESIGNER_PACKAGES.map((p) => (
                      <div className={`nf-ic${on(p.id) ? '' : ' off'}`} key={p.id}>
                        <div className="k">
                          <span>{p.stage}</span>
                          {on(p.id) ? <em>Starts on</em> : null}
                        </div>
                        <b>{p.name}</b>
                        <span>{p.blurb}</span>
                      </div>
                    ))}
                  {ins === 'emails' &&
                    EMAILS.map(([n, w, t]) => (
                      <div className="nf-ic" key={n}>
                        <div className="k">
                          <span>{w}</span>
                          <em>Wears {kit.name}</em>
                        </div>
                        <b>{n}</b>
                        <span>{t}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="sec pb-sec nf-part" id="yours" data-screen-label="06 Make it yours">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Make it yours</b>Keep the kit, change the look · <span className="nf-soon">Coming soon</span>
            </div>
            <h2 className="h-l">Your accent. Your face. Your corners.</h2>
            <p className="nf-sh-p">
              A kit is a starting point. Change the accent, the display face or the corner radius and every surface updates together. Accents are
              checked for contrast before they go live.
            </p>
          </div>
          <div className="nf-cus">
            <div className="nf-cus-c">
              <div className="f">
                <span className="nf-fl">Accent</span>
                <div className="nf-sw-row" role="group" aria-label="Accent">
                  {ACCENTS.map((a) => (
                    <Pressed
                      key={a || 'kit'}
                      on={a === ''}
                      disabled={a !== ''}
                      style={vars({ '--c': a || kit.hex })}
                      aria-label={a || 'Kit default'}
                      title={a || 'Kit default'}
                    />
                  ))}
                </div>
              </div>
              <div className="f">
                <span className="nf-fl">Display face</span>
                <div className="nf-seg" role="group" aria-label="Display face">
                  {FACES.map((f) => (
                    <Pressed key={f} on={f === 'Kit default'} disabled={f !== 'Kit default'}>
                      {f}
                    </Pressed>
                  ))}
                </div>
              </div>
              <div className="f">
                <span className="nf-fl">Corners</span>
                <div className="nf-seg" role="group" aria-label="Corners">
                  {CORNERS.map((c) => (
                    <Pressed key={c} on={c === 'Kit default'} disabled={c !== 'Kit default'}>
                      {c}
                    </Pressed>
                  ))}
                </div>
              </div>
              <p className="nf-cus-note">Coming soon: these choices carry into the site editor. For now they preview only.</p>
            </div>
            <div className="nf-cus-p">
              <Device kit={kit} surface="site" sizes="(max-width: 960px) 90vw, 760px" />
            </div>
          </div>
        </div>
      </section>

      <section className="sec pb-sec nf-part" id="kits" data-screen-label="07 Thirteen kits">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Thirteen profiles</b>Each tuned to one kind of designer
            </div>
            <h2 className="h-l">
              See it. Preview it. <em className="fq-iri-text">Make it yours.</em>
            </h2>
          </div>
          <div className="nf-gal">
            <div className="nf-gal-main">
              <div className="nf-gm-top">
                <div className="nf-tags">
                  <span className="nf-tag">
                    <i />
                    {kit.name}
                    <small>
                      {pad(kitIx + 1)} / {DESIGNER_KITS.length}
                    </small>
                  </span>
                  <span className="nf-tag">
                    {kit.fonts.display} · {kit.fonts.label}
                  </span>
                </div>
                <div className="nf-gal-nav">
                  <button type="button" aria-label="Previous kit" onClick={() => step(-1)}>
                    ‹
                  </button>
                  <button type="button" aria-label="Next kit" onClick={() => step(1)}>
                    ›
                  </button>
                </div>
              </div>
              <div className="nf-spread">
                {(
                  [
                    ['web', 'site', 'Website', 'yourstudio.com · the full theme'],
                    ['ph b', 'spacedesk', 'Space', 'On Frequency'],
                    ['ph', 'spotlight', 'Spotlight', 'Link in bio'],
                    ['mail', 'email', 'Email', 'Four templates · Inbox'],
                  ] as [string, Surface, string, string][]
                ).map(([cls, s, label, sub]) => (
                  <button type="button" className={cls} key={s} aria-label={`Preview the ${label.toLowerCase()}`} onClick={() => setPv({ view: s })}>
                    {s === 'spacedesk' || s === 'spotlight' ? (
                      <Phone kit={kit} shot={s === 'spotlight' ? 'spot' : 'space'} label={label} tone={s === 'spotlight' ? 'dark' : 'light'} sizes="(max-width: 900px) 45vw, 240px" />
                    ) : (
                      <span className="fr">
                        <Shot kit={kit} shot={SURFACE_SHOT[s]} label={label} sizes="(max-width: 900px) 45vw, 480px" mail={mail} />
                      </span>
                    )}
                    <span className="lab">
                      <b>{label}</b>
                      <small>{sub}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="nf-gal-cap">
              <div>
                <b>
                  {kit.hero.title} <em>{kit.hero.em}</em>
                </b>
                <span>{kit.who}</span>
                <div className="meta2">
                  <span>{kit.packages.map(pk).join(' · ')}</span>
                  <span>·</span>
                  <span>Website · Space · Spotlight · Email</span>
                </div>
              </div>
              <div className="ctas">
                <button type="button" className="btn btn-ghost fq-iri-rim" onClick={() => setPv({ view: 'site' })}>
                  Live preview
                </button>
                <Link className="btn fq-iri-btn" href={adoptHref(kit.id)}>
                  Adopt this kit
                </Link>
              </div>
            </div>
            <div className="nf-gal-strip">
              {DESIGNER_KITS.map((k, i) => (
                <Pressed key={k.id} on={k.id === kit.id} className="nf-gt" onClick={() => pick(k.id)} style={vars({ '--c': k.hex })}>
                  <Image src={shotSrc(k.id, 'site')} alt="" width={462} height={270} sizes="200px" />
                  <span className="gl">
                    <i />
                    <span>{k.name}</span>
                    <small>{pad(i + 1)}</small>
                  </span>
                </Pressed>
              ))}
            </div>
          </div>
          <p className="nf-sh-p">Every shot is the real theme. Switch kits any time; your words, offers and dates stay.</p>
        </div>
      </section>

      <section className="sec pb-sec nf-part" id="carry" data-screen-label="08 What carries over">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>What carries over</b>Change it once
            </div>
            <h2 className="h-l">One profile. Every surface follows.</h2>
          </div>
          <div className="nf-cmp" role="table" aria-label="What carries to each surface">
            <div className="hd" role="columnheader" />
            {['Spotlight', 'Space', 'Website', 'Email'].map((h) => (
              <div className="hd" role="columnheader" key={h}>
                {h}
              </div>
            ))}
            {CARRY.map((r) => (
              <div className="nf-cmp-row" role="row" key={r.row}>
                <div className="rw" role="rowheader">
                  {r.row}
                </div>
                {r.cells.map((c, i) => (
                  <div className={c === true ? 'y' : 'p'} role="cell" key={i}>
                    {c === true ? <span className="vh">Yes</span> : <span>{c}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec nf-part" id="built" data-screen-label="09 Built right">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Built right</b>Accessible, send-ready, yours
            </div>
            <h2 className="h-l">The parts you should never have to think about.</h2>
          </div>
          <div className="nf-setup">
            {BUILT.map((b) => (
              <div key={b.title}>
                <span className="n">{b.n}</span>
                <b>{b.title}</b>
                <span>{b.body}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec nf-part" id="questions" data-screen-label="10 Questions">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Questions</b>Before you start
            </div>
            <h2 className="h-l">Good to know.</h2>
          </div>
          <div className="nf-faq">
            {FAQ.map(([q, a], i) => (
              <details key={q} open={i === 0}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec nf-part" id="steps" data-screen-label="11 Setup">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Setup</b>Four steps
            </div>
            <h2 className="h-l">Live in an afternoon.</h2>
          </div>
          <div className="nf-setup">
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

      <section className="sec pb-sec nf-part nf-start" id="start" data-screen-label="12 Start">
        <div className="wrap">
          <div className="nf-next">
            <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.55 })} />
            <span className="k">Start here</span>
            <h3>
              Start your Spotlight.
              <br />
              <em>Choose a theme.</em>
            </h3>
            <p>
              Pick the kit closest to your business. Your Spotlight is live today; your Space, website and emails are ready when you are. Free to
              start.
            </p>
            <div className="nf-kits-chips" role="group" aria-label="Choose a kit">
              {DESIGNER_KITS.map((k) => (
                <Pressed key={k.id} on={k.id === kit.id} onClick={() => pick(k.id)} style={vars({ '--c': k.hex })}>
                  <i />
                  {k.name}
                </Pressed>
              ))}
            </div>
            <div className="ctas">
              <Link className="btn fq-iri-btn" href={adoptHref(kit.id)}>
                Start with {kit.name}
              </Link>
              <button type="button" className="btn btn-ghost fq-iri-rim" onClick={() => setPv({ view: 'site' })}>
                Live preview
              </button>
            </div>
          </div>
        </div>
      </section>

      <Dialog open={pv !== null} onClose={() => setPv(null)} ariaLabel="Designer live preview" align="center" className="max-w-6xl">
        {pv ? (
          <div className="nf-pv">
            <div className="nf-pv-top">
              <div className="nf-seg" role="group" aria-label="Surface">
                {SURFACES.map((s) => (
                  <Pressed key={s} on={pv.view === s} onClick={() => setPv({ view: s })}>
                    {SURFACE_LABEL[s]}
                  </Pressed>
                ))}
              </div>
              <div className={`nf-kp${kpOpen ? ' open' : ''}`}>
                <button type="button" className="nf-kp-step" aria-label="Previous kit" onClick={() => step(-1)}>
                  ‹
                </button>
                <button type="button" className="nf-kp-cur" aria-haspopup="listbox" aria-expanded={kpOpen} onClick={() => setKpOpen((o) => !o)}>
                  <i style={vars({ '--c': kit.hex })} />
                  <span>{kit.name}</span>
                  <small>
                    {kitIx + 1} / {DESIGNER_KITS.length}
                  </small>
                </button>
                <button type="button" className="nf-kp-step" aria-label="Next kit" onClick={() => step(1)}>
                  ›
                </button>
                {kpOpen ? (
                  <div className="nf-kp-menu" role="listbox" aria-label="Kits">
                    {DESIGNER_KITS.map((k, i) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={k.id === kit.id}
                        key={k.id}
                        style={vars({ '--c': k.hex })}
                        onClick={() => {
                          pick(k.id)
                          setKpOpen(false)
                        }}
                      >
                        <i />
                        <span>{k.name}</span>
                        <small>{pad(i + 1)}</small>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="nf-pv-dev">
                <a
                  className="nf-pv-open"
                  href={shotSrc(kit.id, SURFACE_SHOT[pv.view], mail)}
                  target="_blank"
                  rel="noopener"
                >
                  Open the picture ↗
                </a>
                <button type="button" className="nf-pv-x" aria-label="Close preview" onClick={() => setPv(null)}>
                  ×
                </button>
              </div>
            </div>
            <div className="nf-pv-body">
              <Device kit={kit} surface={pv.view} sizes="(max-width: 900px) 90vw, 640px" mail={mail} />
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
