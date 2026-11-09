// The /subscribe BODY on the Frequency design: the form first (it is the whole point of the page), then the
// three steps and the questions. The steps and the questions are passed in from the route, which also
// emits them as the FAQPage schema, so the schema and the visible page are one list.
//
// Layout (site-funnel.css, fsb-): a warm photo of a song circle fills the first screen, the promise on the
// left and the form on a glass panel on the right, so the form is above the fold on every width. Below it,
// the steps run down a dotted line beside the questions, a note and its fine print side by side.
import Link from 'next/link'
import { FnHead } from './parts'
import { photoBg } from '../shared/photo-bg'
import { FrequencySubscribeForm } from './subscribe-form'

const HERO_STILL = '/images/site/group-singing.jpg'

export function FrequencySubscribe({
  steps,
  faq,
}: {
  steps: { t: string; b: string }[]
  faq: { q: string; a: string }[]
}) {
  return (
    <>
      <section className="fn-hero fn-photo fsb-hero" data-screen-label="01 Hero">
        <div className="fn-bg" style={photoBg(HERO_STILL)} aria-hidden="true" />
        <div className="fn-shade" aria-hidden="true" />
        <div className="fq-aura" style={{ '--fq-aura-opacity': 0.22 } as React.CSSProperties} aria-hidden="true" />
        <div className="fq-grain" aria-hidden="true" />
        <div className="wrap fsb-grid">
          <div className="fsb-copy">
            <div className="label">
              <b>Stay in the loop</b>
            </div>
            <h1 className="h-xl">Get notes from Frequency.</h1>
            <p className="fn-lede">
              Leave your email and hear from Daniel Tyack, through Frequency. A few notes a month on Circles, practices, and events.
              Nothing more.
            </p>
          </div>
          <div className="fn-col fn-glass fsb-form" data-screen-label="02 Form">
            <FrequencySubscribeForm />
            <p className="pb-note">We email you to confirm first, so you only hear from us if you actually want to.</p>
          </div>
        </div>
      </section>

      <div className="wrap fsb-pair">
        <section className="fsb-how" data-screen-label="03 How it works">
          <FnHead label="How it works" title="Three steps. No surprises." />
          <ol className="fsb-steps">
            {steps.map((s, i) => (
              <li key={s.t}>
                <span className="fsb-n" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <b>{s.t}</b>
                <span>{s.b}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="fsb-faq" data-screen-label="04 Questions">
          <FnHead label="Straight answers" title="Questions before you sign up." />
          <div className="qa">
            {faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
          <p className="pb-note">
            Want the bigger picture first? <Link href="/the-community">See what Frequency is</Link>.
          </p>
        </section>
      </div>
    </>
  )
}
