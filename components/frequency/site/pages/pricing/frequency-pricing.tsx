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
// WHERE THE REAL LADDER BEATS THE REFERENCE. The design draws three Space plans (Free, Business,
// Non-profit) and three people cards (Joining, Hosting, Buying). The product sells four Space plans
// (Free, Business, Collective, Non Profit) and two personal tiers (Member, Crew), so the cards follow
// the offerings and the plan-count heading is counted, not typed. Every "0%" carries "plus card
// processing" in its own sentence (LIVE-913).
import Link from 'next/link'
import '@/app/themes/frequency/site-pages-b.css'
import { PLAN_STORY } from '@/lib/pricing/plan-story'
import type { FeatureGrid, Offering } from '@/lib/pricing/pricing-grid'

type Faq = { q: string; a: string }[]

/** The reference's card hues, in ladder order. Tokens only. */
const HUES = ['var(--fq-x-aqua-neon)', 'var(--fq-x-sun-neon)', 'var(--fq-x-violet-neon)', 'var(--fq-x-magenta-neon)']

const COUNT_WORD = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six']

/** A CSS custom property on a style prop. React types only know the standard properties. */
function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

function PlanCard({ offering, hue }: { offering: Offering; hue: string }) {
  return (
    <div className="pop" style={vars({ '--fq-pc': hue })}>
      <span className="pglow" />
      <article className="pc">
        <span className="v">{offering.label}</span>
        <div className="price">
          {offering.monthly}
          <small>{offering.tagline}</small>
        </div>
        <ul>
          <li>{offering.billing}</li>
          {offering.trial && <li>{offering.trial}</li>}
          {offering.betaNote && <li>{offering.betaNote}</li>}
          <li>{offering.takeRate}</li>
        </ul>
        <p>{offering.forWho}</p>
        <div className="pb-cta">
          <Link
            className={offering.featured ? 'btn fq-iri-btn' : 'btn btn-ghost fq-iri-rim'}
            href={offering.cta.href}
          >
            {offering.cta.label}
          </Link>
        </div>
      </article>
    </div>
  )
}

/** One matrix cell, in the reference's grammar: ● for yes, – for no, the phrase for a value. The full
 *  phrase rides along for a screen reader, so a row reads on its own. */
function Cell({ kind, text }: { kind: 'yes' | 'no' | 'value'; text: string }) {
  if (kind === 'yes')
    return (
      <td className="c y">
        <span aria-hidden="true">●</span>
        <span className="sr-only">{text}</span>
      </td>
    )
  if (kind === 'no')
    return (
      <td className="c no">
        <span aria-hidden="true">–</span>
        <span className="sr-only">{text}</span>
      </td>
    )
  return <td className="c pb-v">{text}</td>
}

export function FrequencyPricing({
  members,
  spaces,
  grid,
  faq,
}: {
  members: Offering[]
  spaces: Offering[]
  grid: FeatureGrid
  faq: Faq
}) {
  const planCount = COUNT_WORD[spaces.length] ?? String(spaces.length)
  return (
    <>
      <section className="phero big" data-energy="charge" data-screen-label="01 Hero">
        <div className="bg" style={{ backgroundImage: "url('/brand/frequency/photos/day-park-yoga.jpg')" }} />
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.3 })} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <div className="crumbs">
            <Link href="/">Home</Link>
            <span>/</span>
            <Link href="/spaces">For spaces</Link>
            <span>/</span>
            <span>Pricing</span>
          </div>
          <h1 className="h-xl">
            <span className="p-only">
              Free for people. <em className="fq-iri-text">Forever.</em>
            </span>
            <span className="e-only">
              We only earn when we help <em className="fq-iri-text">your community grow.</em>
            </span>
          </h1>
          <p className="p-only">
            Joining, checking in, playing and hosting are free. When you buy a ticket or membership, the money
            goes to the Space.
          </p>
          <p className="e-only">{`Your regulars: 0% ${PLAN_STORY.plusProcessing}. People we bring you: a small share. Non Profits: nothing.`}</p>
          <div className="ctas">
            <span className="p-only">
              <Link className="btn fq-iri-btn" href="/discover/circles">
                Find your Circle
              </Link>
            </span>
            <span className="e-only">
              <Link className="btn fq-iri-btn" href="/spaces">
                Open your Space
              </Link>
            </span>
          </div>
        </div>
      </section>

      <section className="sec" id="plans" data-screen-label="02 Plans">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Plans</b>One price per plan
            </div>
            <h2 className="h-l">
              <span className="p-only">Everything you need to join is free.</span>
              <span className="e-only">{`${planCount} plans. Start free.`}</span>
            </h2>
            <p className="pb-note e-only">{PLAN_STORY.paid}</p>
            <p className="pb-note p-only">{PLAN_STORY.crew}</p>
          </div>
          <div className={`g3 e-only${spaces.length > 3 ? ' pb-g4' : ''}`}>
            {spaces.map((o, i) => (
              <PlanCard key={o.id} offering={o} hue={HUES[i % HUES.length]!} />
            ))}
          </div>
          <div className="g3 p-only">
            {members.map((o, i) => (
              <PlanCard key={o.id} offering={o} hue={HUES[i % HUES.length]!} />
            ))}
            <div className="pop" style={vars({ '--fq-pc': 'var(--fq-x-magenta-neon)' })}>
              <span className="pglow" />
              <article className="pc">
                <span className="v">Buying</span>
                <div className="price">
                  Set by the Space<small>Tickets, memberships and tips.</small>
                </div>
                <ul>
                  <li>Payment goes straight to the host</li>
                  <li>Hosts can refund a ticket</li>
                </ul>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="features" style={{ paddingTop: 0 }} data-screen-label="03 Features by plan">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Features</b>By plan
            </div>
            <h2 className="h-l">Every feature, every plan.</h2>
          </div>
          <div className="mxw">
            <table className="mx">
              <thead>
                <tr>
                  <th>Feature</th>
                  {grid.columns.map((c) => (
                    <th key={c.id} className="c">
                      {c.label}
                    </th>
                  ))}
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
                        <Cell key={grid.columns[i]?.id ?? i} kind={cell.kind} text={cell.text} />
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

      <section className="sec" style={{ paddingTop: 0 }} data-screen-label="04 Questions">
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

      <section className="sec kg" data-screen-label="05 Keep going">
        <div className="wrap">
          <div className="next2" data-energy="charge">
            <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.55 })} />
            <span className="rings" aria-hidden="true" />
            <div className="n2t">
              <span className="k">Keep going</span>
              <h3>Open your Space.</h3>
              <p>{`Free until you charge. Your regulars stay at 0% ${PLAN_STORY.plusProcessing}.`}</p>
            </div>
            <div className="ctas">
              <Link className="btn fq-iri-btn" href="/spaces">
                Open your Space →
              </Link>
              <a className="btn btn-ghost fq-iri-rim" href="#features">
                Compare features
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
