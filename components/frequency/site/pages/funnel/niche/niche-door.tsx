// The six launch doors (/for/<niche>) on the Frequency design, built to Claude Design's niche handoff
// (2026-10-22). ONE template, one config per door: every word is the door's FunnelConfig
// (lib/marketing/funnel-config.ts, so the page, the metadata and the structured data cannot disagree), every
// price row reads the catalog through priceForRow, and the photos, feed, planets and tool previews are the
// design's data (lib/marketing/funnel-design.ts). Every "Open your Space" is funnelStartHref(config), the
// niche's `/join?seq=<niche>` sequence (ADR-1238). Section order is the design's: Hero, Your Space, How it
// works, Features, See it working (with the town's week), The loop, Interlude, Cost, Questions, Founder,
// Two doors.
//
// Server component. The motion lives in five small client islands next to this file (hero card, galaxy,
// tool tabs, loop ring, guide form) and the pill; the kit's FX layer supplies the [data-px] parallax and the
// `.pop` reveals. Under DAWN this file is never rendered (app/for/[niche]/page.tsx picks the body).
import Image from 'next/image'
import Link from 'next/link'
import { SitePage } from '@/components/frequency/site/shell/site-page'
import { FqIcon } from '@/components/frequency/icon'
import { priceForRow } from '@/components/marketing/funnel/funnel-sections'
import type { SiteEvent } from '@/components/frequency/site/pages/shared/data'
import { NICHE_DESIGN, NICHE_PHOTO_DIR, type StepScreen } from '@/lib/marketing/funnel-design'
import {
  FUNNEL_CTA_LABEL,
  FUNNEL_SECONDARY_LABEL,
  MISSION_COPY,
  assuranceItems,
  funnelStartHref,
  type FunnelConfig,
} from '@/lib/marketing/funnel-config'
import { FOUNDING_PLACE, OPENING_DATE_LABEL } from '@/lib/site'
import { ROUTES as SITE } from '@/lib/frequency/site-nav'
import '@/app/themes/active/site-niche'
import { NicheGalaxy } from './galaxy'
import { NicheGuideForm } from './guide-form'
import { NicheHeroCard } from './hero-panel'
import { NicheLoopRing } from './loop-ring'
import { NicheStartPill } from './start-pill'
import { NicheTools } from './tools'

const TAP = 'Tap a tool to read what you can do with it.'
const OPENING = `Opening ${OPENING_DATE_LABEL}`
const PX_STEPS = ['.05', '.16', '.27']
const PX_FEATURES = ['.04', '.14', '.08', '.18']

/** The little app screen under a how-it-works step. */
function StepScreenView({ kind }: { kind: StepScreen }) {
  const r = (label: string, pill?: string, on?: boolean) => (
    <div className="r">
      <i className="av" />
      <span>{label}</span>
      {pill ? <em className={on ? 'on' : undefined}>{pill}</em> : null}
    </div>
  )
  switch (kind) {
    case 'page':
      return (
        <>
          <span className="k">Example page</span>
          <div className="r">
            <i className="av" />
            <span>Your Space name</span>
            <em className="on">Live</em>
          </div>
          <div className="ln" style={{ width: '86%' }} />
          <div className="ln" style={{ width: '64%' }} />
          <div className="ln" style={{ width: '72%' }} />
        </>
      )
    case 'list':
      return (
        <>
          <span className="k">Example contacts</span>
          {r('Imported from a list', 'New', true)}
          {r('Joined from your link', 'New', true)}
          {r('Added at the door')}
        </>
      )
    case 'cal':
      return (
        <>
          <span className="k">Example schedule</span>
          {r('Tue · 10:00', 'Booked', true)}
          {r('Tue · 14:00', 'Open')}
          {r('Thu · 09:00', 'Open')}
        </>
      )
    case 'pay':
      return (
        <>
          <span className="k">Memberships on Business</span>
          {r('Turn on dues', 'Ready', true)}
          {r('Unlimited plan', 'Draft')}
          {r('Class pack', 'Draft')}
        </>
      )
    case 'invite':
      return (
        <>
          <span className="k">Example invitations</span>
          {r('Invite sent', 'Yes', true)}
          {r('Invite sent', 'Maybe')}
          {r('Invite sent')}
        </>
      )
    case 'check':
      return (
        <>
          <span className="k">Example check-ins</span>
          {r('Checked in', 'First visit', true)}
          {r('Checked in')}
          {r('Checked in')}
        </>
      )
    case 'verify':
      return (
        <>
          <span className="k">Example verification</span>
          {r('Organization details', 'Done', true)}
          {r('501(c)(3) status', 'Checking')}
          {r('Your Space', 'Works now', true)}
        </>
      )
    default:
      return (
        <>
          <span className="k">Donations on Non Profit</span>
          {r('One-time gift', 'Received', true)}
          {r('Receipt', 'Sent', true)}
          {r('Thank-you note', 'On')}
        </>
      )
  }
}

/** "Thu 7:00pm" into the date tile's two lines: "Thu" over "7pm". */
function tile(when: string): [string, string] {
  const m = /^(\S+)\s+(\d{1,2})(?::\d{2})?\s*(am|pm)$/i.exec(when)
  return m ? [m[1], `${m[2]}${m[3].toLowerCase()}`] : [when, '']
}

export function NicheDoor({ config, week }: { config: FunnelConfig; week: readonly SiteEvent[] }) {
  const d = NICHE_DESIGN[config.slug]
  if (!d) return null
  const { hero, problem, howItWorks, features, pricing, faq, finalCta } = config
  const start = funnelStartHref(config)
  const loop = config.loop ?? {}
  const hasWeek = week.length > 0

  return (
    <div className="nk-page" data-niche={config.niche}>
      <SitePage
        side="e"
        mood="spaces"
        energy="flow"
        hues={['s', 'm', 'a']}
        locked
        surface="stage"
        cta={{ href: start, label: FUNNEL_CTA_LABEL }}
      />

      {/* 01 Hero */}
      <section className="phero big" id="nk-hero" data-energy="flow" data-screen-label="01 Hero">
        <div className="bg" data-px=".9" aria-hidden="true">
          <Image
            className="nk-bgimg"
            src={`${NICHE_PHOTO_DIR}/${d.photo}`}
            alt=""
            fill
            priority
            sizes="100vw"
            quality={70}
          />
        </div>
        <div className="fq-aura" style={{ '--fq-aura-opacity': 0.3 } as React.CSSProperties} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap nk-hw">
          <div className="nk-htx">
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span aria-hidden="true">/</span>
              <Link href={SITE.spaces}>For spaces</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{d.short}</span>
            </nav>
            <a className="locpill" href={hasWeek ? '#week' : '#example'}>
              <FqIcon name="pin" />
              <b>{FOUNDING_PLACE}</b>
              <span>{OPENING}</span>
              <em>{hasWeek ? 'See this week' : 'See example tools'}</em>
            </a>
            <span className="nk-eb">{hero.eyebrow}</span>
            <h1 className="h-xl nk-h1">
              {d.h1.lead}
              {d.h1.br ? <br /> : ' '}
              <em className="fq-iri-text">
                {d.h1.em.map((line, i) => (
                  <span key={line}>
                    {i > 0 && <br />}
                    {line}
                  </span>
                ))}
              </em>
            </h1>
            <p id="nk-sub">{hero.subhead}</p>
            <div className="ctas">
              <Link className="btn fq-iri-btn" href={start}>
                {FUNNEL_CTA_LABEL}
              </Link>
              <a className="nk-quiet" href="#kit">
                {FUNNEL_SECONDARY_LABEL}
              </a>
            </div>
            <p className="nk-micro">
              <span>{hero.microcopy}</span>
              <span className="nk-trust">{hero.trustLine}</span>
            </p>
          </div>
          <NicheHeroCard you={d.you} items={d.events} />
        </div>
      </section>

      {/* 02 Your Space */}
      <section className="sec nk-space" data-energy="flow" data-screen-label="02 Your Space">
        <div className="wrap split" style={{ alignItems: 'center' }}>
          <div>
            <div className="sh" style={{ marginBottom: 28 }}>
              <div className="label">
                <b>Your Space</b>All in one orbit
              </div>
            </div>
            <div className="nk-prob">
              <h2>{problem.header}</h2>
              <p>{problem.body}</p>
              <p>{TAP}</p>
            </div>
          </div>
          <NicheGalaxy planets={d.planets} caption={problem.caption} />
        </div>
      </section>

      {/* 03 How it works */}
      <section className="sec" id="how-it-works" data-energy="flow" data-screen-label="03 How it works">
        <div className="fq-aura" style={{ '--fq-aura-opacity': 0.22 } as React.CSSProperties} />
        <div className="wrap">
          <div className="sh nk-rise">
            <div className="label">
              <b>How it works</b>Three steps
            </div>
            <h2 className="h-l">{howItWorks.header}</h2>
          </div>
          <div className="nk-track" aria-hidden="true">
            <i />
          </div>
          <div className="g3">
            {howItWorks.steps.map((s, i) => (
              <div key={s.title} className={i === 0 ? 'pop nk-on' : 'pop'} data-px={PX_STEPS[i]}>
                <span className="pglow" />
                <article className="pc nk-step">
                  <span className="num">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  <div className="nk-scr" aria-hidden="true">
                    <StepScreenView kind={d.screens[i]} />
                  </div>
                </article>
              </div>
            ))}
          </div>
          <p className="body-l nk-close">{howItWorks.caption}</p>
        </div>
      </section>

      {/* 04 Features */}
      <section className="sec" id="kit" data-energy="flow" data-screen-label="04 Features">
        <div className="wrap">
          <div className="sh nk-rise">
            <div className="label">
              <b>What you get</b>Four things, working together
            </div>
            <h2 className="h-l">Built around the people you meet.</h2>
          </div>
          <div className="nk-feat">
            {features.map((f, i) => (
              <div key={f.title} className="pop" data-px={PX_FEATURES[i]}>
                <span className="pglow" />
                <article className={f.soft ? 'pc nk-feature soft' : 'pc nk-feature'}>
                  <span className="ic">
                    <FqIcon name={d.featureIcons[i]} />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 05 See it working */}
      <section className="sec" id="example" data-energy="flow" data-screen-label="05 See it working">
        <div className="fq-aura" style={{ '--fq-aura-opacity': 0.22 } as React.CSSProperties} />
        <div className="wrap">
          <NicheTools
            slug={config.slug}
            tools={d.tools}
            you={d.you}
            kind={d.short}
            head={
              <div className="sh" style={{ marginBottom: 0 }}>
                <div className="label">
                  <b>Explore the tools</b>Example previews
                </div>
                <h2 className="h-l">See what you can do.</h2>
              </div>
            }
          />
          {hasWeek && (
            <div className="nk-week" id="week">
              <div className="hd">
                <h3 className="nk-wk-h">
                  <b>This week in North County</b>
                </h3>
                <span>From the town calendar.</span>
              </div>
              <div className="nk-wk">
                {week.map((e) => {
                  const [day, hour] = tile(e.when)
                  return (
                    <Link key={e.id} href={e.href}>
                      <span className="d">
                        {day}
                        {hour && <b>{hour}</b>}
                      </span>
                      <span>
                        <b>{e.title}</b>
                        <small>{[e.when, e.where].filter(Boolean).join(' · ')}</small>
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 06 How people come back */}
      <section className="sec nk-loop" data-energy="flow" data-screen-label="06 How people come back">
        <div className="wrap split" style={{ alignItems: 'center' }}>
          <div>
            <div className="sh" style={{ marginBottom: 28 }}>
              <div className="label">
                <b>Keep in touch</b>Meet, remember, invite
              </div>
              <h2 className="h-l">{loop.header}</h2>
            </div>
            <p className="body-l">{loop.intro}</p>
            <p className="nk-pay">{loop.payoff}</p>
          </div>
          <NicheLoopRing />
        </div>
      </section>

      {/* 06b Interlude */}
      <section className="nk-inter" data-screen-label="06b Interlude">
        <div className="bg" data-px="2.2" aria-hidden="true">
          <Image
            className="nk-bgimg"
            src={`${NICHE_PHOTO_DIR}/${d.interlude}`}
            alt=""
            fill
            sizes="100vw"
            quality={60}
          />
        </div>
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <span className="label">
            <b>Frequency</b>
          </span>
          <p className="h-xl">
            Gather like it <em className="fq-iri-text">matters.</em>
          </p>
        </div>
      </section>

      {/* 07 What it costs */}
      <section className="sec nk-cost" id="pricing" data-energy="still" data-screen-label="07 What it costs">
        <div className="wrap">
          <div className="sh nk-rise">
            <div className="label">
              <b>What it costs</b>Plain pricing
            </div>
            <h2 className="h-l">{pricing.header}</h2>
          </div>
          <div className="band">
            <div>
              <span className="k">How it works</span>
              <p className="nk-pi">{pricing.intro}</p>
            </div>
            <div className="nk-tbl nk-rows">
              {pricing.rows.map((row) => {
                const { price, anchor } = priceForRow(row)
                return (
                  <div key={row.kind} className={row.featured ? 'on' : undefined}>
                    <span className="pn">
                      <b>{row.name}</b>
                      <small>{row.detail}</small>
                    </span>
                    {row.kind === 'resonance' ? (
                      <span className="pv soft">Add-on</span>
                    ) : (
                      <span className="pv">
                        {anchor && (
                          <s>
                            <span className="sr-only">was </span>
                            {anchor}
                          </s>
                        )}{' '}
                        {price}
                        {row.kind !== 'free' && ' a month'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <p className="nk-be">{pricing.breakEvenCaption}</p>
          <p className="nk-pnote">{pricing.note}</p>
          <ul className="nk-as">
            {assuranceItems(config).map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <div className="ctas" style={{ marginTop: 28 }}>
            <Link className="btn fq-iri-btn" href={start}>
              {FUNNEL_CTA_LABEL}
            </Link>
            <Link className="btn btn-ghost fq-iri-rim" href={SITE.pricing}>
              Every plan
            </Link>
          </div>
        </div>
      </section>

      {/* 08 Questions */}
      <section className="sec" id="questions" data-energy="still" data-screen-label="08 Questions">
        <div className="fq-aura" style={{ '--fq-aura-opacity': 0.18 } as React.CSSProperties} />
        <div className="wrap">
          <div className="sh nk-rise">
            <div className="label">
              <b>Questions</b>Asked and answered
            </div>
            <h2 className="h-l">Before you open.</h2>
          </div>
          <div className="qa">
            {faq.map((f, i) => (
              <details key={f.q} open={i === 0 ? true : undefined}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 09 Founder note */}
      <section className="sec" data-energy="flow" data-screen-label="09 Founder note">
        <span className="rings" aria-hidden="true" />
        <div className="wrap nk-fd">
          <div className="nk-fph fq-iri-rim">
            <Image
              data-px=".26"
              src={`${NICHE_PHOTO_DIR}/daniel-tyack.jpg`}
              alt="Daniel Tyack, founder of Frequency"
              fill
              sizes="(max-width: 960px) 100vw, 40vw"
              quality={75}
            />
          </div>
          <div>
            <div className="sh" style={{ marginBottom: 28 }}>
              <div className="label">
                <b>A note from the founder</b>
              </div>
            </div>
            <blockquote>
              <p>{MISSION_COPY.header}</p>
              <p className="body-l">{MISSION_COPY.body}</p>
            </blockquote>
            <cite>
              <span>
                Daniel Tyack<small>Founder, Frequency</small>
              </span>
            </cite>
          </div>
        </div>
      </section>

      {/* 10 Two doors */}
      <section className="sec kg" id="start" data-energy="charge" data-screen-label="10 Two doors">
        <div className="wrap">
          <div className="doors nk-doors">
            <div className="door go">
              <div className="fq-aura" style={{ '--fq-aura-opacity': 0.5 } as React.CSSProperties} />
              <span className="rings" aria-hidden="true" />
              <span className="k">Start now</span>
              <h3>{finalCta.header}</h3>
              <p id="nk-csub">{finalCta.subhead}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Link className="btn fq-iri-btn" href={start}>
                  {FUNNEL_CTA_LABEL}
                </Link>
                <span className="sm">{finalCta.microcopy}</span>
              </div>
            </div>
            <div className="door">
              <span className="k">Not yet</span>
              <h3>Stay in the loop.</h3>
              <p>Launch news for {FOUNDING_PLACE}, and short notes on getting set up.</p>
              <NicheGuideForm formId={`nk-${config.niche}`} />
            </div>
          </div>
        </div>
      </section>

      <NicheStartPill href={start} label={FUNNEL_CTA_LABEL} heroId="nk-hero" doorsId="start" />
    </div>
  )
}
