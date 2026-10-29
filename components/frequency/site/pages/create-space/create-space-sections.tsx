// /create-a-space, the sections below the builder: Sound familiar, Day one, Free to operate, Questions and the
// closing call. Server components, no script: the FAQ is native <details>. Copy is the Claude Design prototype's
// (docs/design-systems/create-a-space), except where the brand voice guide or live /pricing asks for a plainer
// line. Styles: create-space.css, every class cs-.
import Image from 'next/image'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import type { FqIconName } from '@/components/frequency/icon'

const PAINS = [
  {
    pain: 'Six tools and no home.',
    way: 'A Space holds your page, your bookings, your payments and your people in one place.',
    src: '/create-a-space/photos/pain-1.jpg',
    alt: 'A small group talking in a bright room',
  },
  {
    pain: 'A great night, then everyone disappears.',
    way: 'A Space keeps the guest list, so you can welcome people back by name.',
    src: '/create-a-space/photos/pain-2.jpg',
    alt: 'People gathered under string lights at night',
  },
  {
    pain: 'Good with people, buried in logistics.',
    way: 'Let people sign up and pay without the chasing.',
    src: '/create-a-space/photos/pain-3.jpg',
    alt: 'A regular group mid-session at a studio',
  },
]

const TOOLS: { name: string; body: string; icon: FqIconName }[] = [
  { name: 'Booking', body: 'Availability, deposits and reminders from one button.', icon: 'clock' },
  { name: 'Calendar and gatherings', body: 'What’s happening, how to join and who is coming.', icon: 'event' },
  { name: 'Memberships', body: 'Plans people can join in a minute, and pause any time.', icon: 'membership' },
  { name: 'Donations', body: 'A plain way to say yes to the work.', icon: 'giveback' },
  { name: 'Shop', body: 'Sell what you make, with the same look as the rest.', icon: 'tag' },
  { name: 'Journeys and practices', body: 'Guided paths and routines people come back to.', icon: 'practice' },
  { name: 'Circles', body: 'A small group that keeps meeting.', icon: 'circle' },
  { name: 'Reviews', body: 'Kind words, shown where people decide.', icon: 'award' },
  { name: 'QR codes', body: 'A door from the real room to your page.', icon: 'qr' },
  { name: 'Email and contacts', body: 'Your list, your newsletters, your receipts.', icon: 'contacts' },
]

const FAQ = [
  {
    q: 'How long does it really take?',
    a: 'The target is about 12 minutes. A couple of minutes here builds your Space, and the setup walk covers your story, photos and first offering. Have a few photos handy and you can finish in one sitting. If you take payments, connecting payouts adds a few minutes.',
  },
  {
    q: 'Does it cost anything to start?',
    a: 'No. Every Space starts on the free plan, with no card. Plans and prices live on the pricing page, and you can change plan from your Space’s billing page.',
  },
  {
    q: 'Do I have to wait for the email?',
    a: 'No. Your Space is saved the moment you add your email, and you can keep building. Opening the link makes it public. Continue with Google and it goes live straight away.',
  },
  {
    q: 'Can I change the look later?',
    a: 'Yes. Switch Theme Kits or your accent any time. Your website, Spotlight and email change together.',
  },
  {
    q: 'Who can find my Space?',
    a: 'You choose. A listed Space shows in the Spaces directory. A private Space is only open to you and your members.',
  },
  {
    q: 'Do I need a website already?',
    a: 'No. Your Space comes with a website and a Spotlight page in the look you pick.',
  },
  {
    q: 'Can I bring my own domain?',
    a: 'Yes. Your website can run on a domain you own. You connect it from your Space’s settings once you are set up.',
  },
]

export function SoundFamiliar() {
  return (
    <section className="cs-sec cs-sec-rule" data-screen-label="03 Sound familiar" aria-labelledby="cs-familiar-h">
      <div className="cs-sec-in">
        <div className="cs-sec-intro">
          <span className="cs-sec-eyebrow">Sound familiar</span>
          <h2 id="cs-familiar-h" className="cs-sec-h">Good with people. Tired of the <em className="fq-iri-text">tabs.</em></h2>
        </div>
        <div className="cs-pains">
          {PAINS.map((c) => (
            <article key={c.pain} className="cs-pain">
              <div className="cs-pain-pic">
                <Image src={c.src} alt={c.alt} fill sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 400px" style={{ objectFit: 'cover' }} />
                <div className="fq-grain" aria-hidden="true" />
                <div className="cs-pain-fade" aria-hidden="true" />
              </div>
              <div className="cs-pain-text">
                <h3 className="cs-pain-h">{c.pain}</h3>
                <p className="cs-pain-p">{c.way}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export function DayOne() {
  return (
    <section className="cs-sec cs-sec-rule cs-dayone" data-screen-label="04 Day one" aria-labelledby="cs-dayone-h">
      <div className="fq-aura" aria-hidden="true" />
      <div className="cs-sec-in cs-sec-lift">
        <div className="cs-dayone-top">
          <div className="cs-sec-intro">
            <span className="cs-sec-eyebrow">What you get on day one</span>
            <h2 id="cs-dayone-h" className="cs-sec-h">Every tool, ready to switch <em className="fq-iri-text">on.</em></h2>
          </div>
          <p className="cs-sec-sub">Your setup starts with two or three. Turn on the rest when you need them. Each one wears the look you picked.</p>
        </div>
        <ul className="cs-tools">
          {TOOLS.map((t) => (
            <li key={t.name} className="cs-tool">
              <span className="fq-icon-tile"><FqIcon name={t.icon} /></span>
              <b className="cs-tool-h">{t.name}</b>
              <p className="cs-tool-p">{t.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function FreeToOperate() {
  return (
    <section className="cs-sec cs-free-sec" data-screen-label="05 Free to operate" aria-labelledby="cs-free-h">
      <div className="fq-iri-rim cs-free">
        <h2 id="cs-free-h" className="cs-sec-h cs-free-h">
          <span className="cs-free-old">Free to start.</span>
          <span>Free to <em className="fq-iri-text">operate.</em></span>
        </h2>
        <div className="cs-free-body">
          <p className="cs-sec-sub cs-free-p">We want every business on Frequency to succeed, so every business tool is on your Space from day one: your website, Spotlight, bookings, memberships, email and more, with limits sized for a launch. No card, no trial clock. You pay when you start charging, and card processing is extra.</p>
          <Link href="/pricing" className="fq-iri-rim cs-free-link">See pricing<FqIcon name="arrow" size={16} /></Link>
        </div>
      </div>
    </section>
  )
}

export function Questions() {
  return (
    <section className="cs-sec" data-screen-label="06 Questions" aria-labelledby="cs-faq-h">
      <div className="cs-sec-in cs-faq">
        <div className="cs-sec-intro">
          <span className="cs-sec-eyebrow">Questions</span>
          <h2 id="cs-faq-h" className="cs-sec-h">Before you <em className="fq-iri-text">start.</em></h2>
        </div>
        <div className="cs-faq-list">
          {FAQ.map((f) => (
            <details key={f.q} className="cs-q">
              <summary className="cs-q-s">{f.q}<FqIcon name="plus" className="cs-q-i" /></summary>
              <p className="cs-q-a">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Closing() {
  return (
    <section className="cs-sec cs-sec-rule cs-close" data-screen-label="07 Closing" aria-labelledby="cs-close-h">
      <div className="fq-aura" aria-hidden="true" />
      <div className="cs-close-in">
        <h2 id="cs-close-h" className="cs-close-h">Get people together. Do things on <em className="fq-iri-text">purpose.</em></h2>
        <a className="btn fq-iri-btn cs-go" href="#get-started">Start my Free Space<FqIcon name="arrow" size={18} /></a>
        <p className="cs-close-fine">Free to start. You can change everything later.</p>
      </div>
    </section>
  )
}
