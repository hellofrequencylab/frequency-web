// /system on the Frequency design (LIVE-1562): the whole system in one story. Built from the template kit only
// (phero, sec, sh, tg-row, tg-card, vz-steps, mx table, KeepGoing); no page CSS of its own and no site-theme
// CSS anywhere (ADR-1906: a kit shows up here only as a picture inside a card). Every price and rate reads
// from the pricing input the route resolved, never from a literal. Copy lives in system-data.ts.
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import '@/app/themes/active/site-pages-b'
import { OPERATOR_START_HREF } from '@/lib/site'
import type { PricingGridInput } from '@/lib/pricing/pricing-grid'
import { pricingTiers, priceStringsFrom } from '@/lib/pricing/pricing-page'
import { PLAN_STORY } from '@/lib/pricing/plan-story'
import { formatCents, formatBps } from '@/lib/pricing/display'
import { NETWORK_PLAN, NETWORK_SITE_PLAN } from '@/lib/pricing/plans'
import { networkTakeRateBpsForPlan, networkTakeRateFromStored } from '@/lib/billing/pricing-keys'
import { themePagePath } from '@/lib/themes/library'
import { SITE_THEMES } from '@/lib/theme/site-style'
import { ThemePicture } from '../themes/theme-picture'
import { WiredIn } from '../shared/wired-in'
import { SystemHub } from './system-hub'
import {
  SYSTEM_CLOSE,
  SYSTEM_DESIGN_ONCE,
  SYSTEM_FAQ,
  SYSTEM_HERO,
  SYSTEM_HUB,
  SYSTEM_INSIDE,
  SYSTEM_KIT,
  SYSTEM_OWNERS,
  SYSTEM_PAIN,
  SYSTEM_PRICE,
  SYSTEM_REACH,
  SYSTEM_WEEK,
  SYSTEM_WIZARD,
  designOnceSurfaces,
} from './system-data'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

function Head({ label, sub, title, body }: { label: string; sub?: string; title: string; body?: string }) {
  return (
    <div className="sh">
      <div className="label">
        <b>{label}</b>
        {sub}
      </div>
      <h2 className="h-l">{title}</h2>
      {body && <p className="pb-note">{body}</p>}
    </div>
  )
}

/** The price facts the page states, all read from the input (SCAN-793 rule: nothing typed by hand). */
export function systemPriceFacts(input: PricingGridInput) {
  const P = priceStringsFrom(input.catalog)
  const tiers = pricingTiers(input.betaActive ?? true, { values: input.values, catalog: input.catalog })
  const rate = formatBps(networkTakeRateBpsForPlan('business', networkTakeRateFromStored(input.values.take_rate)))
  const [s1, s2, s3] = NETWORK_SITE_PLAN.tiers
  return {
    tiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      forWho: t.forWho,
      lead: t.priceKind === 'from' ? 'from' : '',
      price: t.price.month.foundingCents === 0 ? 'Free' : `${formatCents(t.price.month.foundingCents)} a month`,
      was: t.price.month.listCents !== t.price.month.foundingCents && t.price.month.foundingCents > 0 ? formatCents(t.price.month.listCents) : '',
      featured: t.featured,
    })),
    facts: [
      `No cut of your own sales. 0% on the people already yours, ${PLAN_STORY.plusProcessing}.`,
      `${rate} once, only on a customer the network introduces.`,
      `${PLAN_STORY.crewSpace}`,
      `Custom domain ${P.customDomain} a month on Business, included with Collective.`,
      `Network: ${formatCents(NETWORK_PLAN.baseCents)} a month plus ${formatCents(NETWORK_PLAN.chapterCents)} a chapter, ${NETWORK_PLAN.includedChapters} chapters at the least.`,
      `Client sites for Networks: ${formatCents(s1.cents)}, ${formatCents(s2.cents)} and ${formatCents(s3.cents)} a site, ${formatCents(NETWORK_SITE_PLAN.badgeRemovalCents)} to remove the badge.`,
    ],
  }
}

export function FrequencySystem({ input }: { input: PricingGridInput }) {
  const { tiers, facts } = systemPriceFacts(input)
  const surfaces = designOnceSurfaces()
  const label = (id: string) => SITE_THEMES.find((t) => t.id === id)?.label ?? id
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
            <span aria-current="page">The system</span>
          </nav>
          <p className="label">
            <b>{SYSTEM_HERO.eyebrow}</b>
          </p>
          <h1 className="h-xl">
            Design it once. <em className="fq-iri-text">Launch when you like.</em>
          </h1>
          <p>
            Your website, your Spotlight, your emails and your sign-ups, all from one theme. Your people, events, tickets, payments, Circles and
            teaching, all behind one login. Everything you run, with one account.
          </p>
          <div className="ctas">
            <Link className="btn fq-iri-btn" href="/themes">
              Pick your kit
            </Link>
            <a className="btn btn-ghost fq-iri-rim" href={SYSTEM_OWNERS.demos[0].href} target="_blank" rel="noopener">
              See a live site
            </a>
          </div>
          <p className="pb-note">{SYSTEM_HERO.trust}</p>
          <p className="pb-note">{SYSTEM_HERO.who}</p>
        </div>
      </section>

      <section className="sec pb-sec" id="pain" data-screen-label="02 Pain">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <Head label={SYSTEM_PAIN.label} title={SYSTEM_PAIN.heading} body={SYSTEM_PAIN.body} />
          <div className="tg-row two">
            <div className="tg-card">
              <p className="label">
                <b>Today</b>
              </p>
              <ul>
                {SYSTEM_PAIN.logins.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
            <div className="tg-card">
              <p className="label">
                <b>With a Space</b>
              </p>
              <h3>{SYSTEM_PAIN.console.title}</h3>
              <p>{SYSTEM_PAIN.console.body}</p>
            </div>
          </div>
          <p className="pb-note">{SYSTEM_PAIN.caption}</p>
        </div>
      </section>

      <section className="sec pb-sec" id="design-once" data-screen-label="03 Design once">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <Head label={SYSTEM_DESIGN_ONCE.label} title={SYSTEM_DESIGN_ONCE.heading} body={SYSTEM_DESIGN_ONCE.body} />
          <div className="tg-row three">
            <div className="tg-card">
              <p className="label">
                <b>One decision</b>
              </p>
              <h3>{SYSTEM_DESIGN_ONCE.source.title}</h3>
              <p>{SYSTEM_DESIGN_ONCE.source.body}</p>
            </div>
            {surfaces.map((s) => (
              <div className="tg-card" key={s.name} data-surface-ready={s.ready}>
                <p className="label">
                  <b>{s.ready}</b>
                </p>
                <h3>{s.name}</h3>
                <p>{s.carries}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="hub" data-screen-label="04 The hub">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <Head label={SYSTEM_HUB.label} title={SYSTEM_HUB.heading} />
          <SystemHub />
        </div>
      </section>

      <section className="sec pb-sec" id="week" data-screen-label="05 One week">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <Head label={SYSTEM_WEEK.label} title={SYSTEM_WEEK.heading} />
          <ol className="vz-steps">
            {SYSTEM_WEEK.steps.map((s, i) => (
              <li key={s.title}>
                <span className="vz-n">
                  {String(i + 1).padStart(2, '0')} · {s.part}
                </span>
                <b>{s.title}</b>
                <span>{s.body}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec pb-sec" id="setup" data-screen-label="06 Guided setup">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <Head label={SYSTEM_WIZARD.label} title={SYSTEM_WIZARD.heading} body={SYSTEM_WIZARD.body} />
          <ol className="vz-steps">
            {SYSTEM_WIZARD.steps.map((s, i) => (
              <li key={s.title}>
                <span className="vz-n">{String(i + 1).padStart(2, '0')}</span>
                <b>{s.title}</b>
                <span>{s.body}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec pb-sec" id="kit" data-screen-label="07 The kit">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <Head label={SYSTEM_KIT.label} title={SYSTEM_KIT.heading} body={SYSTEM_KIT.body} />
          <div className="tg-row three">
            {SYSTEM_KIT.featured.map((id) => (
              <div className="tg-card" key={id}>
                <Link href={themePagePath(id)} aria-label={`See the ${label(id)} kit`}>
                  <ThemePicture theme={id} label={label(id)} slot="kit" />
                </Link>
                <h3>{label(id)}</h3>
                <p>
                  <Link href={themePagePath(id)}>See the {label(id)} kit →</Link>
                </p>
              </div>
            ))}
          </div>
          <div className="ctas">
            <Link className="btn btn-ghost fq-iri-rim" href={SYSTEM_KIT.more.href}>
              {SYSTEM_KIT.more.label}
            </Link>
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="inside" data-screen-label="08 What is inside">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <Head label={SYSTEM_INSIDE.label} title={SYSTEM_INSIDE.heading} body={SYSTEM_INSIDE.body} />
          <WiredIn />
        </div>
      </section>

      <section className="sec pb-sec" id="reach" data-screen-label="09 What the theme touches">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <Head label={SYSTEM_REACH.label} title={SYSTEM_REACH.heading} />
          <div className="mxw pb-mxw" role="region" aria-label="What the theme touches" tabIndex={0}>
            <table className="mx pb-mx">
              <caption className="sr-only">What a Theme Kit styles, surface by surface</caption>
              <thead>
                <tr>
                  {SYSTEM_REACH.columns.map((c) => (
                    <th scope="col" key={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SYSTEM_REACH.rows.map(([surface, does, why]) => (
                  <tr key={surface}>
                    <th scope="row">{surface}</th>
                    <td>{does}</td>
                    <td>{why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="demos" data-screen-label="10 Demo Spaces">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <Head label={SYSTEM_OWNERS.label} sub={SYSTEM_OWNERS.note} title={SYSTEM_OWNERS.heading} body={SYSTEM_OWNERS.body} />
          <div className="tg-row two">
            {SYSTEM_OWNERS.demos.map((d) => (
              <div className="tg-card" key={d.name}>
                <p className="label">
                  <b>Demo Space · {d.kit} kit</b>
                </p>
                <ThemePicture theme={d.theme} label={d.name} slot="website" />
                <h3>{d.name}</h3>
                <p>{d.line}</p>
                <p>
                  <a href={d.href} target="_blank" rel="noopener">
                    Open the site →
                  </a>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="price" data-screen-label="11 What it costs">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <Head label={SYSTEM_PRICE.label} title={SYSTEM_PRICE.heading} body={PLAN_STORY.crewSpace} />
          <div className="tg-row three">
            {tiers.map((t) => (
              <div className="tg-card" key={t.id} data-featured={t.featured || undefined}>
                <p className="label">
                  <b>{t.name}</b>
                  {t.featured ? 'Most people start here' : ''}
                </p>
                <h3>
                  {t.lead ? `${t.lead} ` : ''}
                  {t.price}
                  {t.was ? (
                    <>
                      {' '}
                      <s>{t.was}</s>
                    </>
                  ) : null}
                </h3>
                <p>{t.forWho}</p>
              </div>
            ))}
          </div>
          <ul className="pb-note" data-price-facts>
            {facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <div className="ctas">
            <Link className="btn btn-ghost fq-iri-rim" href="/pricing">
              See every plan and fee
            </Link>
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="questions" data-screen-label="12 Questions">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <Head label="Questions" sub="Things people ask first" title="Good to know." />
          <div className="tg-row two">
            {SYSTEM_FAQ.map((f) => (
              <div className="tg-card" key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <KeepGoing
        title={SYSTEM_CLOSE.title}
        body={SYSTEM_CLOSE.body}
        primary={{ href: '/themes', label: 'Pick your kit →' }}
        secondary={{ href: OPERATOR_START_HREF, label: 'Start free' }}
      />
    </>
  )
}
