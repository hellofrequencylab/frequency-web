// /free-spotlight (VLS-05): the landing for the "Get a Free Spotlight" button. Built from the template kit only
// (sec, sh, label, ctas, KeepGoing) plus the lane E sheet (site-funnel.css, fsp- classes); no page CSS of its own.
// Copy follows docs/marketing/voice-and-language-guide.md: pain first, plain words, no timing claim and no outcome
// promise. It names nothing the launch does not do: the page builds beside the form and an account is asked for at
// Publish. Dark until LAUNCH_ENTRY_ENABLED is on (the route 404s).
//
// Layout: a showcase. The hero sets the promise beside one person's portrait in an iridescent frame (a Spotlight
// is one person on one page); what you get is three glass cards stacked like pages, each a little lower than the
// last; how it goes is a numbered path, orbs on a dotted line, the last step lit because it is yours.
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { FreeSpotlightButton } from '@/components/marketing/free-spotlight-button'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { FREE_SPOTLIGHT_LABEL, freeSpotlightHref } from '@/lib/launch/entry'
import { photoImg } from '../shared/parts'
import '@/app/themes/active/site-pages-b'
import '@/app/themes/active/site-funnel'

const CARDS: readonly { label: string; title: string; body: string; icon: FqIconName }[] = [
  { label: 'Your page', title: 'Who you are, on one page', body: 'Your name, a line about you, your links and your next gathering. In your own words, laid out for you.', icon: 'page' },
  { label: 'Your Space', title: 'A Space comes with it', body: 'It is where your people, events and Circles live when you are ready for them. Free to open.', icon: 'space' },
  { label: 'Yours to change', title: 'Pick a look, change a word', body: 'Edit it any time. Add an offer when you have one. Nothing here is set in stone.', icon: 'edit' },
]

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
      <section className="fn-hero fsp-hero" data-energy="charge" data-screen-label="01 Hero">
        <div className="fq-aura" style={aura(0.3)} aria-hidden="true" />
        <span className="rings" aria-hidden="true" />
        <div className="wrap fsp-grid">
          <div className="fsp-copy">
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
            <p className="fn-lede">
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
          <div className="fsp-show">
            <span className="fsp-orb" aria-hidden="true" />
            <figure className="fsp-portrait fq-iri-rim fq-iri-sheen">
              {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes the portrait img itself */}
              <img
                decoding="async"
                {...photoImg('/images/site/sound-healing.jpg', '(max-width: 860px) 80vw, 420px')}
                alt="A sound healer smiling among her crystal bowls on the sand"
              />
              <span className="fq-grain" aria-hidden="true" />
            </figure>
            <figure className="fsp-inset">
              {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes the inset img itself */}
              <img
                loading="lazy"
                decoding="async"
                {...photoImg('/images/site/kirtan-song-circle.jpg', '(max-width: 860px) 40vw, 220px')}
                alt="A song circle on the grass, hands raised"
              />
            </figure>
          </div>
        </div>
      </section>

      <section className="sec pb-sec fsp-what" id="what" data-screen-label="02 What you get">
        <div className="fq-aura" style={aura(0.22)} aria-hidden="true" />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>What you get</b>
            </div>
            <h2 className="h-l">A page, and a place for the people who find it.</h2>
          </div>
          <div className="fsp-stack">
            {CARDS.map((c, i) => (
              <div className={i === 0 ? 'fsp-card fq-panel fq-iri-rim' : 'fsp-card fq-panel'} key={c.title}>
                <span className="fq-icon-tile" aria-hidden="true">
                  <FqIcon name={c.icon} />
                </span>
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

      <section className="sec pb-sec fsp-how" id="how" data-screen-label="03 How it goes">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>How it goes</b>
            </div>
            <h2 className="h-l">Three steps, and the last one is yours.</h2>
          </div>
          <ol className="fsp-path">
            {STEPS.map((s, i) => (
              <li key={s.title} className={i === STEPS.length - 1 ? 'fsp-yours' : undefined}>
                <span className="fsp-n" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
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
        secondary={{ href: '/features', label: 'See every feature' }}
      />
    </>
  )
}
