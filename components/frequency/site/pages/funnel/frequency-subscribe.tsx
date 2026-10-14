// The /subscribe BODY on the Frequency design: the form first (it is the whole point of the page), then the
// three steps and the questions. The steps and the questions are passed in from the route, which also
// emits them as the FAQPage schema, so the schema and the visible page are one list.
import Link from 'next/link'
import { FnColumn, FnHead, FnHero } from './parts'
import { FrequencySubscribeForm } from './subscribe-form'

export function FrequencySubscribe({
  steps,
  faq,
}: {
  steps: { t: string; b: string }[]
  faq: { q: string; a: string }[]
}) {
  return (
    <>
      <FnHero
        center
        kicker="Stay in the loop"
        title="Get notes from Frequency."
        lede="Leave your email and hear from Daniel Tyack, through Frequency. A few notes a month on Circles, practices, and events. Nothing more."
      />
      <FnColumn label="02 Form">
        <FrequencySubscribeForm />
        <p className="pb-note">We email you to confirm first, so you only hear from us if you actually want to.</p>
      </FnColumn>

      <section className="fn-sec" data-screen-label="03 How it works">
        <div className="wrap">
          <FnHead label="How it works" title="Three steps. No surprises." />
          <ol className="vz-steps">
            {steps.map((s, i) => (
              <li key={s.t}>
                <span className="vz-n">{String(i + 1).padStart(2, '0')}</span>
                <b>{s.t}</b>
                <span>{s.b}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="fn-sec" data-screen-label="04 Questions">
        <div className="wrap">
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
        </div>
      </section>
    </>
  )
}
