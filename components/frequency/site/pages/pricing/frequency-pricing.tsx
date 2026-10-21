// The /pricing BODY on the Frequency design (templates/website/Pricing.html), picked by the route when
// SITE_DESIGN is 'frequency'. The shell lane owns the kit root, header, footer, FX and side state; this
// is the page between them.
//
// 🔴 NOTHING HERE IS TYPED MONEY. Every plan card, price, billing line, rate line and CTA reads off the
// Offering model the DAWN page reads (lib/pricing/pricing-grid.ts, from the operator-set catalog); the
// matrix is spaceFeatureGrid; the questions are the same pricingFaq the FAQPage schema emits; the plan
// argument is PLAN_STORY. Each card's CTA is `offering.cta` verbatim, so the links into checkout are the
// DAWN page's links, unchanged (docs/CHECKOUT.md).
//
// LOCKED TO THE SPACES SIDE. The reference pins Pricing to Spaces (`body[data-lock="e"]`), and so does
// its row in lib/frequency/site-pages.ts, so the body renders the Spaces copy outright rather than
// shipping a People half the lock would only ever hide. The personal tiers are real products the
// reference has no card for, so they keep a band of their own under the plans, in the reference's
// People-side copy ("Everything for people is free.") and the same `.pop > .pc` card.
//
// WHERE THE REAL LADDER BEATS THE REFERENCE. The design draws three Space plans (Free, Business,
// Non-profit) and three people cards (Joining, Hosting, Buying); the page keeps two cards and turns Buying into a
// note. The product sells four Space plans
// (Free, Business, Collective, Non Profit) and two personal tiers (Member, Crew), so the cards follow
// the offerings and the plan-count heading is counted, not typed. Every "0%" carries "plus card
// processing" in its own sentence (LIVE-913).
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import '@/app/themes/active/site-pages-b'
import { PLAN_STORY } from '@/lib/pricing/plan-story'
import { NETWORK_PLAN } from '@/lib/pricing/plans'
import type { AddOnGroups } from '@/lib/pricing/pricing-addons'
import { COLLECTIVE_PARTNER_CAP, type FeatureGrid, type Offering } from '@/lib/pricing/pricing-grid'
import { OPERATOR_START_HREF } from '@/lib/site'
import { splitPrice } from './split-price'
import { PlanPeriodScope, PlanPeriodSwitch } from './plan-period'
import type { CalcModel } from './calculator-model'
import { MotionLinks, OwnersMotion, PlanLadderMotion } from './plan-motion'
import { PricingAddOns } from './pricing-addons'
import { PricingCalculator } from './pricing-calculator'

export { splitPrice }

type Faq = { q: string; a: string }[]

/** The reference's card hues, in ladder order. Tokens only. */
const HUES = ['var(--fq-x-aqua-neon)', 'var(--fq-x-sun-neon)', 'var(--fq-x-sky-neon)', 'var(--fq-x-magenta-neon)']

const COUNT_WORD = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six']

/** A CSS custom property on a style prop. React types only know the standard properties. */
function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

/** What one plan card shows. The Space offerings and the personal offerings render through it, so both
 *  plan rows are the one component. */
interface PlanCardView {
  name: string
  who: string
  price: string
  /** The yearly price, shown when the switch is on Yearly. Absent (free, or set by the Space): the
   *  monthly price stands for both. */
  yearly?: string | null
  /** The struck list price where the config carries a beta anchor ("$29"), else null. */
  anchor?: string | null
  points: string[]
  detail?: string
  cta?: { label: string; href: string }
  featured?: boolean
  hue: string
}

function offeringView(o: Offering, hue: string): PlanCardView {
  return {
    name: o.label,
    who: o.tagline,
    price: o.monthly,
    yearly: o.yearly,
    anchor: o.listAnchor,
    points: [o.billing, o.trial, o.betaNote, o.takeRate].filter((x): x is string => Boolean(x)),
    detail: o.forWho,
    cta: o.cta,
    featured: o.featured,
    hue,
  }
}

/** What buying costs a member, as a note under the two people cards (the reference drew it as a third
 *  card). Copy only, no figure. */
const BUYING_NOTE =
  'Buying: tickets, memberships and tips are priced by the Space and paid straight to the host. Hosts can refund a ticket.'

/** A card's price row. With `show`, it is one of the card's two periods and the kit CSS shows it only
 *  while the switch is on that period; without it the figure stands for both. */
function PriceBlock({ label, anchor, show }: { label: string; anchor?: string | null; show?: 'month' | 'year' }) {
  const { lead, amount, per } = splitPrice(label)
  // A figure or a one-word price ("Free") takes the display size; a phrase ("Set by the Space") steps down.
  const big = /\d/.test(amount) || !/\s/.test(amount)
  return (
    <div className={big ? 'pb-price' : 'pb-price is-text'} data-period-show={show}>
      {anchor && (
        <s className="pb-was">
          <span className="sr-only">Was </span>
          {anchor}/mo
        </s>
      )}
      <span className="pb-fig">
        {lead && <span className="pb-lead">{lead}</span>}
        <span className="pb-amt">{amount}</span>
        {per && <span className="pb-per">{per}</span>}
      </span>
    </div>
  )
}

/** One plan card, in five named rows: head, price, points, detail, CTA. Inside a plan row the rows
 *  are a subgrid, so every card lines its price, its list and its button up with its neighbours (a
 *  flex column with the CTA pinned to the bottom where subgrid is missing). The price is sized off the
 *  card's own width (a container query), and wraps rather than clips. The featured plan, read off
 *  `Offering.featured`, wears the kit's iridescent rim and the "Recommended" flag the DAWN card uses. */
function PlanCard({ view }: { view: PlanCardView }) {
  const year = view.yearly ?? null
  return (
    <div className={`pop pb-plan${view.featured ? ' is-feat' : ''}`} style={vars({ '--fq-pc': view.hue })}>
      <span className="pglow" />
      <article className={`pc pb-pc${view.featured ? ' fq-iri-rim' : ''}`}>
        <header className="pb-head">
          <div className="pb-top">
            <h3>{view.name}</h3>
            {view.featured && <span className="pb-flag">Recommended</span>}
          </div>
          <p className="pb-who">{view.who}</p>
        </header>
        {year ? (
          <>
            <PriceBlock label={view.price} anchor={view.anchor} show="month" />
            <PriceBlock label={year} show="year" />
          </>
        ) : (
          <PriceBlock label={view.price} anchor={view.anchor} />
        )}
        <ul className="pb-pts">
          {view.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {view.detail ? <p className="pb-for">{view.detail}</p> : <span className="pb-for" aria-hidden="true" />}
        <div className="pb-cta">
          {view.cta && (
            <Link className={view.featured ? 'btn fq-iri-btn' : 'btn btn-ghost fq-iri-rim'} href={view.cta.href}>
              {view.cta.label}
            </Link>
          )}
        </div>
      </article>
    </div>
  )
}

/** One matrix cell: ✓ for yes, – for no, the phrase for a value. The full phrase rides along for a
 *  screen reader, so a row reads on its own. `feat` tints the featured plan's column. */
function Cell({ kind, text, feat }: { kind: 'yes' | 'no' | 'value'; text: string; feat?: boolean }) {
  const f = feat ? ' is-feat' : ''
  if (kind === 'yes')
    return (
      <td className={`c y${f}`}>
        <span aria-hidden="true">✓</span>
        <span className="sr-only">{text}</span>
      </td>
    )
  if (kind === 'no')
    return (
      <td className={`c no${f}`}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">{text}</span>
      </td>
    )
  return <td className={`c pb-v${f}`}>{text}</td>
}

export function FrequencyPricing({
  members,
  spaces,
  grid,
  faq,
  yearlyNote,
  calculator,
  addOns,
}: {
  members: Offering[]
  spaces: Offering[]
  grid: FeatureGrid
  faq: Faq
  /** The yearly line under the Monthly / Yearly switch (annualDiscountNote), so the page never states
   *  a discount the charge does not apply. */
  yearlyNote: string
  /** The scroll-through's seven steps (calculator-model.ts), read off the same offerings as the cards. */
  calculator: CalcModel
  /** Every add-on and included extra with its price (lib/pricing/pricing-addons.ts). */
  addOns: AddOnGroups
}) {
  const planCount = COUNT_WORD[spaces.length] ?? String(spaces.length)
  // The matrix columns are the Space offerings: each header carries its price, and the featured plan's
  // column is tinted, so the table reads against the cards above it.
  const byId = new Map(spaces.map((o) => [o.id, o]))
  const featId = spaces.find((o) => o.featured)?.id
  return (
    <>
      <section className="phero big" data-energy="charge" data-screen-label="01 Hero">
        <div className="bg" style={{ backgroundImage: "url('/brand/frequency/photos/day-park-yoga.jpg')" }} />
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.3 })} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/spaces">For spaces</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Pricing</span>
          </nav>
          <h1 className="h-xl">
            We only earn when we help <em className="fq-iri-text">your community grow.</em>
          </h1>
          <p>{`Your regulars: 0% ${PLAN_STORY.plusProcessing}. People we bring you: a small share. Non Profits: nothing.`}</p>
          <div className="ctas">
            <Link className="btn fq-iri-btn" href={OPERATOR_START_HREF}>
              Open your Space
            </Link>
            <a className="btn btn-ghost fq-iri-rim" href="#path">
              Walk the path
            </a>
          </div>
        </div>
      </section>

      <PlanPeriodScope>
        <section className="sec pb-sec" id="people" data-screen-label="02b For people">
          <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
          <div className="wrap">
            <div className="sh">
              <div className="label">
                <b>For people</b>Joining and hosting
              </div>
              <h2 className="h-l">Join free. Do more with Crew.</h2>
              <p className="pb-note">{PLAN_STORY.crew}</p>
            </div>
            <PlanPeriodSwitch note={yearlyNote} />
            <div className="pb-row">
              <div className={`pb-plans n${members.length}`}>
                {members.map((o, i) => (
                  <PlanCard key={o.id} view={offeringView(o, HUES[(i + 1) % HUES.length]!)} />
                ))}
              </div>
            </div>
            <p className="pb-note">{BUYING_NOTE}</p>
          </div>
        </section>

        <section className="sec pb-sec" id="spaces" data-screen-label="02 Plans">
          <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
          <div className="wrap">
            <div className="sh">
              <div className="label">
                <b>Side by side</b>One price per plan
              </div>
              <h2 className="h-l">{`${planCount} Space plans, side by side.`}</h2>
              <p className="pb-note">{PLAN_STORY.paid}</p>
            </div>
            <PlanPeriodSwitch note={yearlyNote} />
            <div className="pb-row">
              <div className={`pb-plans n${spaces.length}`}>
                {spaces.map((o, i) => (
                  <PlanCard key={o.id} view={offeringView(o, HUES[i % HUES.length]!)} />
                ))}
              </div>
            </div>
            <p className="pb-note">{PLAN_STORY.selling}</p>
          </div>
        </section>

        <PricingCalculator model={calculator} />

        <section className="sec pb-sec" id="collective-or-network" data-screen-label="02a Collective or Network">
          <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
          <div className="wrap">
            <div className="sh">
              <div className="label">
                <b>Which plan</b>One Space to a whole network
              </div>
              <h2 className="h-l">Run one Space, partner with others, or run a whole network.</h2>
              <p className="pb-note">
                Collective is for separate groups that partner: each keeps its own members, payouts and settings, and you
                share a calendar and cross-list each other&apos;s Circles and Journeys. Network is for one organization with
                chapters: one membership works in every chapter, central admins see the whole network, and each chapter
                leader runs their own.
              </p>
            </div>
            <PlanLadderMotion spaces={spaces} partnerCap={COLLECTIVE_PARTNER_CAP} />
            <div className="pm-split">
              <div className="sh">
                <div className="label">
                  <b>Collective or Network?</b>Ask who owns the Spaces
                </div>
                <p className="pb-note">
                  Different owners working together is a Collective. One owner with chapters is a Network.
                </p>
              </div>
              <OwnersMotion includedChapters={NETWORK_PLAN.includedChapters} maxChapters={NETWORK_PLAN.maxChapters} />
            </div>
            <MotionLinks />
          </div>
        </section>

      </PlanPeriodScope>

      <PricingAddOns addOns={addOns} spaces={spaces} />

      <section className="sec pb-sec" id="features" data-screen-label="03 Features by plan">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Features</b>By plan
            </div>
            <h2 className="h-l">Every feature, every plan.</h2>
            <p className="pb-note">{PLAN_STORY.meters}</p>
          </div>
          <div className="mxw pb-mxw" role="region" aria-label="Features by plan" tabIndex={0}>
            <table className="mx pb-mx">
              <caption className="sr-only">Every feature, by plan</caption>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  {grid.columns.map((c) => {
                    const o = byId.get(c.id)
                    return (
                      <th key={c.id} scope="col" className={c.id === featId ? 'c is-feat' : 'c'}>
                        {c.label}
                        {o && <small>{o.monthly}</small>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {grid.groups.flatMap((g) => [
                  <tr key={`g-${g.key}`} className="grp">
                    <td colSpan={grid.columns.length + 1}>{g.label}</td>
                  </tr>,
                  ...g.rows.map((r) => (
                    <tr key={`${g.key}-${r.key}`}>
                      <td>{r.label}</td>
                      {r.cells.map((cell, i) => (
                        <Cell
                          key={grid.columns[i]?.id ?? i}
                          kind={cell.kind}
                          text={cell.text}
                          feat={grid.columns[i]?.id === featId}
                        />
                      ))}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
          <p className="pb-note">{PLAN_STORY.rate}</p>
        </div>
      </section>

      <section className="sec pb-sec" id="questions" data-screen-label="04 Questions">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Questions</b>Plainly answered
            </div>
            <h2 className="h-l">Before you ask.</h2>
          </div>
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
        title="Open your Space."
        body={`Free until you charge. Your regulars stay at 0% ${PLAN_STORY.plusProcessing}.`}
        primary={{ href: OPERATOR_START_HREF, label: 'Open your Space →' }}
        secondary={{ href: '#features', label: 'Compare features' }}
      />
    </>
  )
}
