// The comparison pages (/vs and /vs/<slug>, GE11-1) on the Frequency design. Every word about the other
// tool comes from the lib/marketing/comparisons registry, the same rows the DAWN pages and the Article /
// FAQPage / ItemList schema read, so this body can make no claim the registry does not: what the tool is
// good at, the honest difference, and the side-by-side rows. We never knock the other tool.
//
// The contrast is the kit's `.mx` matrix (templates/website/Pricing.html), one row per dimension, with
// the tool's column and Frequency's. Money lines carry "plus card processing" in the same sentence
// (LIVE-913), read from PLAN_STORY.
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { PLAN_STORY } from '@/lib/pricing/plan-story'
import { COMPARISONS, comparisonCopy, comparisonPath, type Comparison } from '@/lib/marketing/comparisons'
import { FnHead, FnPhotoHero } from './parts'
import { photoImg } from '../shared/parts'

// A Circle that keeps meeting, on the beach at golden hour: the photo inside the hub's second circle.
const HERO_STILL = '/brand/frequency/photos/gathering-12.jpg'

/** The /vs hub: every comparison, as links. The hero pairs the copy with two circles, an outline for the
 *  one-off and a photo of a Circle that meets again; each comparison is a split card, the other tool on the
 *  plain half and Frequency on the glass half, both read from the registry's first row ("What it is"). */
export function FrequencyCompareIndex() {
  return (
    <>
      <section className="fn-hero fv-hero" data-screen-label="01 Hero">
        <span className="rings" aria-hidden="true" />
        <div className="fq-aura" style={{ '--fq-aura-opacity': 0.22 } as React.CSSProperties} aria-hidden="true" />
        <div className="wrap fv-grid">
          <div className="fv-copy">
            <div className="label">
              <b>Compare</b>
            </div>
            <h1 className="h-xl">
              How Frequency <em className="fq-iri-text">compares.</em>
            </h1>
            <p className="fn-lede">
              Most tools help you throw one event, share one link, or sell one ticket. Frequency is the standing room underneath: a
              small Circle that keeps meeting in person. Hosting is free, selling starts at Business, and your own people are always
              free. Here is how it stacks up against the tools you already know.
            </p>
            <div className="ctas">
              <Link className="btn fq-iri-btn" href="/discover">
                Find a Circle near you →
              </Link>
              <Link className="btn btn-ghost fq-iri-rim" href="/pricing">
                See the honest pricing
              </Link>
            </div>
          </div>
          <div className="fv-venn" aria-hidden="true">
            <span className="fv-once" />
            <span className="fv-again fq-iri-rim">
              {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes the circle's img itself */}
              <img decoding="async" {...photoImg(HERO_STILL, '(max-width: 860px) 60vw, 420px')} alt="" />
              <span className="fq-grain" />
            </span>
            <i className="fv-vs">vs</i>
          </div>
        </div>
      </section>

      <section className="fn-sec" data-screen-label="02 Comparisons">
        <div className="wrap">
          <FnHead label="Every comparison" title="Pick the tool you know." />
          <div className="fv-cards">
            {COMPARISONS.map((c) => {
              const row = c.contrast[0]
              return (
                <Link key={c.slug} className="fv-card" href={comparisonPath(c.slug)}>
                  <span className="fv-them">
                    <small>{c.category}</small>
                    {row && <span>{row.them}</span>}
                  </span>
                  <span className="fv-us fq-glass">
                    <b>Frequency vs {c.name}</b>
                    {row && <span>{row.us}</span>}
                    <span className="ar" aria-hidden="true">
                      →
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <KeepGoing
        title="The tool is not the point. The people you keep seeing are."
        body="Frequency is free to join, and it stays free. Find a Circle near you and start showing up."
        primary={{ href: '/discover', label: 'Find a Circle near you →' }}
        secondary={{ href: '/pricing', label: 'See the honest pricing' }}
      />
    </>
  )
}

/** One comparison, /vs/<slug>. `image` is the route's hero photo (also the Article schema's image). */
export function FrequencyCompare({ comparison, image }: { comparison: Comparison; image: string }) {
  const copy = comparisonCopy(comparison)
  const others = COMPARISONS.filter((c) => c.slug !== comparison.slug)
  return (
    <>
      <FnPhotoHero
        image={image}
        kicker={`Alternative to ${comparison.name}`}
        title={copy.h1}
        lede={`${comparison.name} is a great ${comparison.category}. Frequency is a different shape: a free local Circle that keeps meeting in person. Here is how they compare.`}
      >
        <div className="ctas">
          <Link className="btn fq-iri-btn" href="/discover">
            Find a Circle near you →
          </Link>
        </div>
      </FnPhotoHero>

      {/* Answer-first: the honest difference, in the first lines. */}
      <section className="sec" data-screen-label="02 The difference">
        <div className="wrap">
          <FnHead label="The short answer" title="The invite is the easy part. The standing room is the thing." />
          <p className="fn-lede">{copy.lede}</p>
          <p className="pb-note">{comparison.forReader}</p>
        </div>
      </section>

      <section className="fn-sec" data-screen-label="03 Side by side">
        <div className="wrap">
          <FnHead label="Side by side" title={`${comparison.name} vs Frequency.`} />
          <div className="mxw" role="region" aria-label={`${comparison.name} vs Frequency`} tabIndex={0}>
            <table className="mx">
              <caption className="sr-only">{`${comparison.name} and Frequency, compared row by row`}</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Dimension</span>
                  </th>
                  <th scope="col">{comparison.name}</th>
                  <th scope="col" className="fn-us">
                    Frequency
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.contrast.map((row) => (
                  <tr key={row.dimension}>
                    <th scope="row" className="fn-dim">
                      {row.dimension}
                    </th>
                    <td>{row.them}</td>
                    <td className="fn-us">{row.us}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="fn-sec" data-screen-label="04 Where to start">
        <div className="wrap">
          <div className="band">
            <div>
              <span className="k">Where to start</span>
              <h3>Keep {comparison.name} for what it does well.</h3>
              <p>
                {`If you want the part it does not do, the small group that keeps meeting, look at the Circles already gathering near you, then join one or start your own.`}
                {comparison.moneyBeat
                  ? ` And hosting is free. When you start charging, that is Business, with 0% on your own bookings, ${PLAN_STORY.plusProcessing}. That is the whole deal.`
                  : ''}
              </p>
            </div>
            <div className="ctas">
              <Link className="btn fq-iri-btn" href="/discover">
                Find a Circle near you →
              </Link>
              {comparison.moneyBeat ? (
                <Link className="btn btn-ghost fq-iri-rim" href="/pricing">
                  See the honest pricing
                </Link>
              ) : (
                <Link className="btn btn-ghost fq-iri-rim" href="/the-community">
                  See how Circles work
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* The questions, mirrored into the FAQPage schema the route emits. */}
      <section className="fn-sec" data-screen-label="05 Questions">
        <div className="wrap">
          <FnHead label="Questions" title="Common questions." />
          <div className="qa">
            {copy.faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* The other comparisons and the hub, as links a visitor and a crawler can follow (SCAN-801). */}
      <section className="fn-sec" data-screen-label="06 More comparisons">
        <div className="wrap">
          <FnHead label="More comparisons" title="The other tools you know." />
          <div className="qa fn-links">
            {others.map((c) => (
              <Link key={c.slug} className="hp-a" href={comparisonPath(c.slug)}>
                <span>
                  <b>Frequency vs {c.name}</b>
                  <small>{c.category}</small>
                </span>
                <span className="ar" aria-hidden="true">
                  →
                </span>
              </Link>
            ))}
          </div>
          <p className="pb-note">
            <Link href="/vs">Every comparison</Link>
          </p>
        </div>
      </section>

      <KeepGoing
        title="Skip the one-off. Find the room that meets again."
        body="Frequency is free to join, and it stays free. Find a Circle near you, show up, and come back."
        primary={{ href: '/discover', label: 'Find a Circle near you →' }}
        secondary={{ href: '/vs', label: 'Every comparison' }}
      />
    </>
  )
}
