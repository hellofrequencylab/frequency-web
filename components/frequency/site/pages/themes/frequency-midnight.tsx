// /themes/nocturne on the Frequency design (LIVE-1380): the feature page for the Midnight mega theme, the
// first of the family. Built from the template kit only (phero, sec, sh, tg-card, KeepGoing); no page CSS of
// its own. Copy follows docs/marketing/voice-and-language-guide.md: pain point first, no figures we cannot
// stand behind (the design's research stats are left out on purpose).
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import '@/app/themes/active/site-pages-b'
import { OPERATOR_START_HREF } from '@/lib/site'
import { midnightKit } from '@/lib/sites/kits/midnight-variants'
import type { CoreKitNiche } from '@/lib/sites/kits/types'
import { MidnightPreview } from './midnight-preview'
import { MidnightKitPicker, type MidnightKitChoice } from './midnight-kit-picker'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

/** The pains a guide, teacher or healer names, and what Nocturne does about each. Copy only. */
export const MIDNIGHT_PAINS: { pain: string; why: string; fix: string }[] = [
  {
    pain: 'People tap my bio link, look around, and leave.',
    why: 'A list of links passes visitors along. Every extra page is another place to lose them.',
    fix: 'Your Spotlight books, sells and collects emails on the page itself, with one main button at the top.',
  },
  {
    pain: 'I book on one app, take payment on another and send the video link by email.',
    why: 'Three brands in one booking reads as unfinished, and every hand-off is a chance to drop someone.',
    fix: 'Booking, deposits, reminders and the account page live in one place and look like you.',
  },
  {
    pain: 'I update my prices in four places and still miss one.',
    why: 'A link page, a directory listing and a website drift apart within a month.',
    fix: 'One site record. Change a date, price or headline once and all three surfaces follow.',
  },
  {
    pain: 'Clients email to ask when I am free, and I answer two days later.',
    why: 'A contact form waits for you. A booking button does not.',
    fix: 'The main button is on every page and every surface: book, join the run, or become a member.',
  },
  {
    pain: 'Every platform shows me forty features I do not need yet.',
    why: 'A full suite on day one turns a weekend setup into a month.',
    fix: 'Your kit starts with two or three tools. Add the rest when you need them; nothing is lost when you switch.',
  },
]

/** The three surfaces one site record fills, in the order people grow into them. */
export const MIDNIGHT_SURFACES: { step: string; name: string; body: string; lives: string; wears: string; changes: string }[] = [
  {
    step: '01 · Day one',
    name: 'Spotlight',
    body: 'Your link-in-bio page. The same hero, doors and featured offer your website opens with.',
    lives: 'Its own Spotlight link',
    wears: 'Nocturne in full',
    changes: 'Your bio link sells something on the first tap.',
  },
  {
    step: '02 · On the network',
    name: 'Space',
    body: 'Your page on Frequency, where your town finds you. Frequency keeps its frame; the page wears your fonts, your accent and your offers.',
    lives: 'Your Space on Frequency',
    wears: 'Frequency, with your fonts and accent',
    changes: 'You are found by people already looking.',
  },
  {
    step: '03 · Your own domain',
    name: 'Website',
    body: 'Booking, gatherings, Journeys, membership and a shop as you need them. Built from the same blocks, so nothing is written twice.',
    lives: 'Your own domain',
    wears: 'Nocturne in full',
    changes: 'A complete site, without starting again.',
  },
]

/** What carries from the record to each surface. */
export const MIDNIGHT_CARRIES: { what: string; where: string }[] = [
  { what: 'Name and mark', where: 'All three' },
  { what: 'Fonts', where: 'All three' },
  { what: 'Accent colour', where: 'All three. On Frequency it paints the buttons and tabs.' },
  { what: 'Offers, dates and prices', where: 'All three' },
  { what: 'Headlines and copy', where: 'Spotlight and website' },
  { what: 'Page frame', where: 'Nocturne on Spotlight and website; Frequency on your Space' },
]

const KIT_NICHES: CoreKitNiche[] = ['coaches', 'studios', 'hosts', 'venues', 'nonprofits', 'networks']

/** One choice per niche kit, read from the kit data so the picker never drifts from what a site is given. */
export const MIDNIGHT_KIT_CHOICES: MidnightKitChoice[] = KIT_NICHES.map((niche) => {
  const kit = midnightKit(niche)
  const home = kit.pages.find((p) => p.slug === 'home') ?? kit.pages[0]
  const hero = home.blocks.find((b) => b.type === 'MidnightHero')
  const title = typeof hero?.props?.title === 'string' ? hero.props.title : kit.label
  return {
    niche,
    label: kit.label,
    description: kit.description,
    headline: title.replace(/\*/g, '').replace(/\s*\n\s*/g, ' '),
    pages: kit.pages.map((p) => p.label),
  }
})

export const MIDNIGHT_STEPS: { n: string; title: string; body: string }[] = [
  { n: '01', title: 'Your practice', body: 'Pick the closest kit. The preview updates as you choose.' },
  { n: '02', title: 'Name and tools', body: 'Keep the kit’s tools or add more: sessions, gatherings, Journeys, membership, shop.' },
  { n: '03', title: 'Your look', body: 'Keep the kit’s accent or use your own. Set corners, spacing and header.' },
  { n: '04', title: 'Launch', body: 'Spotlight, Space and website go live together. Edit anything after.' },
]

export const MIDNIGHT_FAQ: { q: string; a: string }[] = [
  { q: 'Can I start with only a Spotlight?', a: 'Yes. Most people do. Your Space and website use the same record, so they are ready when you are, with nothing to rewrite.' },
  { q: 'What happens to my content if I switch kits?', a: 'Tools, block order and look reset to the new kit. Your text, offers and dates stay saved on their blocks. A block the new kit hides keeps its content and returns as you left it.' },
  { q: 'Will my Space look exactly like my website?', a: 'Your Space keeps Frequency’s page frame, so people on the network always know where they are. It wears your name, fonts, accent and offers, so it reads as you.' },
  { q: 'Do I need every tool on day one?', a: 'No. Each kit starts with two or three. Turn on sessions, gatherings, Journeys, membership or the shop when you are ready to run them.' },
  { q: 'Who owns my contacts?', a: 'You do. Sign-ups, bookings and check-ins build your list, and your list stays yours.' },
  { q: 'What does it cost?', a: 'Free to start. Business when you charge.' },
]

export function FrequencyMidnight() {
  return (
    <>
      <section className="phero big" data-energy="charge" data-screen-label="01 Hero">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.3 })} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/spaces">For Spaces</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Nocturne</span>
          </nav>
          <h1 className="h-xl">
            Nocturne, a Theme Kit. <em className="fq-iri-text">Set it up once.</em>
          </h1>
          <p>For guides, teachers and healers. Your Spotlight, your Space on Frequency and your own website, kept in step.</p>
          <div className="ctas">
            <a className="btn fq-iri-btn" href={OPERATOR_START_HREF}>
              Use Nocturne
            </a>
            <MidnightPreview />
            <Link className="btn btn-ghost fq-iri-rim" href="/pricing">
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="familiar" data-screen-label="02 Sound familiar">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Sound familiar?</b>What guides tell us
            </div>
            <h2 className="h-l">The work is good. The setup gets in the way.</h2>
            <p className="pb-note">
              A link page, a booking tool, a payments app, an email list and a website, all saying slightly different things. Nocturne
              replaces the patchwork.
            </p>
          </div>
          <div className="tg-row two">
            {MIDNIGHT_PAINS.map((p) => (
              <div className="tg-card" key={p.pain}>
                <h3>{p.pain}</h3>
                <p>{p.why}</p>
                <p>
                  <b>With Nocturne.</b> {p.fix}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="travels" data-screen-label="03 How it travels">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>How it travels</b>Spotlight, then Space, then website
            </div>
            <h2 className="h-l">Start with a link. Grow into a site.</h2>
          </div>
          <div className="tg-row two">
            {MIDNIGHT_SURFACES.map((s) => (
              <div className="tg-card" key={s.name}>
                <p className="label">
                  <b>{s.step}</b>
                </p>
                <h3>{s.name}</h3>
                <p>{s.body}</p>
                <p>
                  <b>Lives at.</b> {s.lives}
                </p>
                <p>
                  <b>Wears.</b> {s.wears}
                </p>
                <p>
                  <b>What changes.</b> {s.changes}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="one-record" data-screen-label="04 One record">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>One site record</b>Three surfaces
            </div>
            <h2 className="h-l">Change it once.</h2>
            <p className="pb-note">People check you in more than one place. Nocturne keeps what they find in step, so you update it one time.</p>
          </div>
          <div className="tg-row two">
            {MIDNIGHT_CARRIES.map((c) => (
              <div className="tg-card" key={c.what}>
                <h3>{c.what}</h3>
                <p>{c.where}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="kits" data-screen-label="04b Pick a kit">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Pick a kit</b>Watch all three change together
            </div>
            <h2 className="h-l">Start from the closest fit.</h2>
          </div>
          <MidnightKitPicker choices={MIDNIGHT_KIT_CHOICES} />
        </div>
      </section>

      <section className="sec pb-sec" id="steps" data-screen-label="05 Setup">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Setup</b>Four steps
            </div>
            <h2 className="h-l">Live in an afternoon.</h2>
          </div>
          <div className="tg-row two">
            {MIDNIGHT_STEPS.map((s) => (
              <div className="tg-card" key={s.n}>
                <p className="label">
                  <b>{s.n}</b>
                </p>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="questions" data-screen-label="06 Questions">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Questions</b>Before you start
            </div>
            <h2 className="h-l">Good to know.</h2>
          </div>
          <div className="tg-row two">
            {MIDNIGHT_FAQ.map((f) => (
              <div className="tg-card" key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <KeepGoing
        title="Start with your Spotlight."
        body="Free to start. Business when you charge."
        primary={{ href: OPERATOR_START_HREF, label: 'Use Nocturne →' }}
        secondary={{ href: '/pricing', label: 'See every plan' }}
      />
    </>
  )
}
