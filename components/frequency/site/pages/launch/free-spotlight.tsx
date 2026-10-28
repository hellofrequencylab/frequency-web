// /free-spotlight (VLS-05): the landing for the "Get a Free Spotlight" button. Built from the template kit only
// (phero, sec, sh, tg-card, vz-steps, KeepGoing); no page CSS of its own and no site-theme CSS. Copy follows
// docs/marketing/voice-and-language-guide.md: pain first, plain words, no timing claim and no outcome promise.
// It names nothing the launch does not do: the page builds beside the form and an account is asked for at
// Publish. Dark until LAUNCH_ENTRY_ENABLED is on (the route 404s).
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { FreeSpotlightButton } from '@/components/marketing/free-spotlight-button'
import { FREE_SPOTLIGHT_LABEL, freeSpotlightHref } from '@/lib/launch/entry'

const CARDS = [
  { label: 'Your page', title: 'Who you are, on one page', body: 'Your name, a line about you, your links and your next gathering. In your own words, laid out for you.' },
  { label: 'Your Space', title: 'A Space comes with it', body: 'It is where your people, events and Circles live when you are ready for them. Free to open.' },
  { label: 'Yours to change', title: 'Pick a look, change a word', body: 'Edit it any time. Add an offer when you have one. Nothing here is set in stone.' },
] as const

const STEPS = [
  { title: 'Tell us who you are', body: 'A name, one line and a link. That is enough to start.' },
  { title: 'Watch it take shape', body: 'Your page builds beside the form, using your own words.' },
  { title: 'Publish it', body: 'We ask you to make an account when you publish, not before.' },
] as const

function aura(opacity: number): React.CSSProperties {
  return { '--fq-aura-opacity': opacity } as React.CSSProperties
}

export function FreeSpotlightLanding() {
  return (
    <>
      <section className="phero big" data-energy="charge" data-screen-label="01 Hero">
        <div className="fq-aura" style={aura(0.3)} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Free Spotlight</span>
          </nav>
          <p className="label">
            <b>Free Spotlight</b>
          </p>
          <h1 className="h-xl">
            One page to send people to. <em className="fq-iri-text">Free.</em>
          </h1>
          <p>
            You do good work, and your links are scattered across six places. A Spotlight puts who you are, what you offer and how to reach you
            on one page. A free Space comes with it, so the people who find you have somewhere to land.
          </p>
          <div className="ctas">
            <FreeSpotlightButton surface="landing" variant="primary" />
            <a className="btn btn-ghost fq-iri-rim" href="#how">
              See how it goes
            </a>
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="what" data-screen-label="02 What you get">
        <div className="fq-aura" style={aura(0.22)} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>What you get</b>
            </div>
            <h2 className="h-l">A page, and a place for the people who find it.</h2>
          </div>
          <div className="tg-row three">
            {CARDS.map((c) => (
              <div className="tg-card" key={c.title}>
                <p className="label">
                  <b>{c.label}</b>
                </p>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="how" data-screen-label="03 How it goes">
        <div className="fq-aura" style={aura(0.22)} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>How it goes</b>
            </div>
            <h2 className="h-l">Three steps, and the last one is yours.</h2>
          </div>
          <ol className="vz-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="vz-n">{String(i + 1).padStart(2, '0')}</span>
                <b>{s.title}</b>
                <span>{s.body}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <KeepGoing
        title="Start with one page."
        body="Free, and yours."
        kicker="Free Spotlight"
        primary={{ href: freeSpotlightHref('landing'), label: FREE_SPOTLIGHT_LABEL }}
        secondary={{ href: '/system', label: 'See the whole system' }}
      />
    </>
  )
}
