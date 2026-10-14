// The operator funnel door (/for/<niche>, ADR-591) on the Frequency design. ONE template, one config per
// niche, exactly as on DAWN: every word on this page is the niche's FunnelConfig
// (lib/marketing/funnel-config.ts) or one of its shared constants, every price row reads the catalog
// through the same priceForRow the DAWN door uses, and every Start button reads funnelStartHref(config),
// so the funnel sequence and its Create-a-Space destination are unchanged (ADR-1238).
//
// What the design changes is the frame: under Frequency the door sits inside the site shell (lane A), so
// it drops its own splash header, sticky bar and footer, and the sections wear the kit's grammar (photo
// hero, `.never` chips, `.vz-steps`, `.pc` cards, the `.band`, plan rows, `.qa`, Keep going). The DAWN
// door's SVG product drawings are not redrawn; nothing on the page depended on them for a fact.
//
// LOCKED TO THE SPACES SIDE: these doors are written for Builders (people who run a Space). The page table
// (lib/frequency/site-pages.ts) is keyed by served routes and /for itself is not one, so the body sets the
// side with <SitePage/>.
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { SitePage } from '@/components/frequency/site/shell/site-page'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { priceForRow } from '@/components/marketing/funnel/funnel-sections'
import {
  type FunnelConfig,
  type FunnelIconName,
  FUNNEL_CTA_LABEL,
  FUNNEL_SECONDARY_LABEL,
  LOOP_COPY,
  MISSION_COPY,
  assuranceItems,
  funnelStartHref,
} from '@/lib/marketing/funnel-config'
import { FnHead, FnPhotoHero } from './parts'

/** The config's icon names, on the design's sprite. */
const ICON: Record<FunnelIconName, FqIconName> = {
  calendar: 'event',
  contact: 'contacts',
  qr: 'qr',
  envelope: 'message',
  spark: 'zap',
}

const HUES = ['var(--fq-x-sun-neon)', 'var(--fq-x-magenta-neon)', 'var(--fq-x-violet-neon)', 'var(--fq-x-aqua-neon)']

export function FrequencyNiche({ config }: { config: FunnelConfig }) {
  const { hero, problem, howItWorks, features, pricing, faq, finalCta } = config
  const start = funnelStartHref(config)
  const loopHeader = config.loop?.header ?? LOOP_COPY.header
  const loopPayoff = config.loop?.payoff ?? LOOP_COPY.caption
  return (
    <>
      <SitePage side="e" mood="spaces" hues={['s', 'm', 'v']} />
      <FnPhotoHero image="/brand/frequency/photos/gathering-09.jpg" kicker={hero.eyebrow} title={hero.h1} lede={hero.subhead}>
        <div className="ctas">
          <Link className="btn fq-iri-btn" href={start}>
            {FUNNEL_CTA_LABEL}
          </Link>
          <Link className="btn btn-ghost fq-iri-rim" href="#how-it-works">
            {FUNNEL_SECONDARY_LABEL}
          </Link>
        </div>
        <p className="fn-micro">{hero.microcopy}</p>
        <p className="fn-micro">{hero.trustLine}</p>
      </FnPhotoHero>

      <section className="fn-sec fn-first" data-screen-label="02 Assurance">
        <div className="wrap">
          <div className="never" role="list">
            {assuranceItems(config).map((it) => (
              <span key={it} role="listitem">
                {it}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="fn-sec" data-screen-label="03 Problem">
        <div className="wrap">
          <FnHead label="The problem" title={problem.header} note={problem.body} />
          <p className="pb-note">{problem.caption}</p>
        </div>
      </section>

      <section className="fn-sec" id="how-it-works" data-screen-label="04 How it works">
        <div className="wrap">
          <FnHead label="How it works" title={howItWorks.header} />
          <ol className="vz-steps">
            {howItWorks.steps.map((s, i) => (
              <li key={s.title}>
                <span className="vz-n">{String(i + 1).padStart(2, '0')}</span>
                <b>{s.title}</b>
                <span>{s.body}</span>
              </li>
            ))}
          </ol>
          <p className="pb-note">{howItWorks.caption}</p>
        </div>
      </section>

      <section className="fn-sec" data-screen-label="05 Features">
        <div className="wrap">
          <FnHead label="What you get" title="Everything the work needs, in one place." />
          <div className="g3">
            {features.map((f, i) => (
              <article
                key={f.title}
                className={f.soft ? 'pc fn-soft' : 'pc'}
                style={{ '--fq-pc': HUES[i % HUES.length] } as React.CSSProperties}
              >
                <span className="ic">
                  <FqIcon name={ICON[f.icon]} />
                </span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="fn-sec" data-screen-label="06 The loop">
        <div className="wrap">
          <div className="band">
            <div>
              <span className="k">How it grows</span>
              <h3>{loopHeader}</h3>
              {config.loop?.intro && <p>{config.loop.intro}</p>}
            </div>
            <p>{loopPayoff}</p>
          </div>
        </div>
      </section>

      <section className="fn-sec" id="pricing" data-screen-label="07 Pricing">
        <div className="wrap">
          <FnHead label="Pricing" title={pricing.header} note={pricing.intro} />
          <ul className="fn-rows">
            {pricing.rows.map((row) => {
              const { price, anchor } = priceForRow(row)
              return (
                <li key={row.kind} data-featured={row.featured ? 'true' : undefined}>
                  <span>
                    <b>{row.name}</b>
                    <small>{row.detail}</small>
                  </span>
                  <span className="fn-price">
                    {anchor && (
                      <s>
                        <span className="sr-only">was </span>
                        {anchor}
                      </s>
                    )}
                    {price}
                    {row.kind !== 'free' && <em>a month</em>}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="pb-note fn-strong">{pricing.breakEvenCaption}</p>
          <p className="pb-note">{pricing.note}</p>
          <div className="ctas fn-after-s">
            <Link className="btn fq-iri-btn" href={start}>
              {FUNNEL_CTA_LABEL}
            </Link>
            <Link className="btn btn-ghost fq-iri-rim" href="/pricing">
              Every plan
            </Link>
          </div>
        </div>
      </section>

      <section className="fn-sec" data-screen-label="08 Mission">
        <div className="wrap">
          <FnHead label="Why it exists" title={MISSION_COPY.header} note={MISSION_COPY.body} />
        </div>
      </section>

      <section className="fn-sec" data-screen-label="09 Questions">
        <div className="wrap">
          <FnHead label="Questions" title="Questions, answered plainly." />
          <div className="qa">
            {faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <KeepGoing
        title={finalCta.header}
        body={`${finalCta.subhead} ${finalCta.microcopy}`}
        primary={{ href: start, label: FUNNEL_CTA_LABEL }}
        secondary={{ href: '/pricing', label: 'See pricing' }}
      />
    </>
  )
}
