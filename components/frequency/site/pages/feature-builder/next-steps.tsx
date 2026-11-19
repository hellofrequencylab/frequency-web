// WHAT'S NEXT (LIVE-2481): the card a finished builder shows. It offers every other feature, one tap each, with its
// clock, and "I'm done for now" beside them, because nobody has to build all four (Daniel, 2026-11-19: "People should
// not feel trapped"). Server-safe markup; the builder shows it once the build is done. Styles: feature-studio.css.
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { OPEN_FEATURES, LAUNCH_BUSINESS, feature as featureEntry, nextFeatures, type FeatureId } from '@/lib/feature-builder/catalog'

export function NextSteps({ done, built = [], outHref }: { done: FeatureId; built?: readonly FeatureId[]; outHref: string }) {
  const options = nextFeatures(done, built)
  const { made, doneWord } = featureEntry(done)
  return (
    <div className="fb-next">
      <h2 className="fb-next-h">Want to keep going?</h2>
      <ul className="fb-next-list">
        {options.map((f) => (
          <li key={f.id}>
            <Link href={f.href} className="fb-next-row">
              <span className="fq-icon-tile"><FqIcon name={f.icon} /></span>
              <span className="fb-next-text"><b>{f.name}</b><span>{f.promise}</span></span>
              <span className="fb-next-min">{f.minutes} min</span>
            </Link>
          </li>
        ))}
        <li>
          <Link href={LAUNCH_BUSINESS.href} className="fb-next-row">
            <span className="fq-icon-tile"><FqIcon name="zap" /></span>
            <span className="fb-next-text"><b>{LAUNCH_BUSINESS.name}</b><span>{LAUNCH_BUSINESS.promise}</span></span>
            <span className="fb-next-min">{LAUNCH_BUSINESS.minutes} min</span>
          </Link>
        </li>
      </ul>
      <Link href={outHref} className="fb-next-out">I&apos;m done for now. My {made} {doneWord === 'live' ? 'stays live' : 'waits as a draft'}.</Link>
    </div>
  )
}

/** The four builders side by side, under each builder's hero: what else there is, never a sequence. */
export function BuilderLadder({ current }: { current: FeatureId }) {
  return (
    <section className="cs-sec cs-sec-rule" aria-labelledby="fb-ladder-h">
      <div className="cs-sec-in">
        <div className="cs-sec-intro">
          <span className="cs-sec-eyebrow">Pick what you need</span>
          <h2 id="fb-ladder-h" className="cs-sec-h">Start with one. Add more <em className="fq-iri-text">whenever.</em></h2>
        </div>
        <div className="fb-ladder">
          {OPEN_FEATURES.map((f) => (
            <Link key={f.id} href={f.href} className="fb-ladder-card" aria-current={f.id === current ? 'page' : undefined}>
              <span className="fq-icon-tile"><FqIcon name={f.icon} /></span>
              <b>{f.name}</b>
              <span>{f.promise}</span>
              <i>{f.id === current ? 'You are here' : `About ${f.minutes} minutes`}</i>
            </Link>
          ))}
          <Link href={LAUNCH_BUSINESS.href} className="fb-ladder-card">
            <span className="fq-icon-tile"><FqIcon name="zap" /></span>
            <b>{LAUNCH_BUSINESS.name}</b>
            <span>{LAUNCH_BUSINESS.promise}</span>
            <i>About {LAUNCH_BUSINESS.minutes} minutes</i>
          </Link>
        </div>
      </div>
    </section>
  )
}
