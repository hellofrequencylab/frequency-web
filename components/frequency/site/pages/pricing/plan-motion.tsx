// THE PRICING MOTION GRAPHICS (design handoff "Pricing page infographics redesign", 2026-10-21): three
// figures that explain the Space ladder, Collective against Network, and what you pay on sales. Server
// Components, CSS only: motion is keyframes in app/themes/frequency/site-pages-b.css (`.pm-*`), hover and
// keyboard reveals are :hover / :focus-visible, and every animation stops under prefers-reduced-motion
// (the tooltips and the numbers stay).
//
// 🔴 NOTHING HERE IS TYPED MONEY. Prices come off the Offering model (lib/pricing/pricing-grid.ts), the
// Network base and chapter figures off NETWORK_PLAN, the fee percentages off each offering's rate. The
// colours are the kit's tokens (see `.pm` in the sheet); there is no hex in this file.
import Link from 'next/link'
import { formatCents } from '@/lib/pricing/display'
import { INDEPENDENT_CONTACT_HREF } from '@/lib/pricing/network-contact'
import { PLAN_STORY } from '@/lib/pricing/plan-story'
import { NETWORK_PLAN } from '@/lib/pricing/plans'
import type { Offering } from '@/lib/pricing/pricing-grid'
import { splitPrice } from './split-price'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

/** One hover / focus note. The thing it hangs on is focusable, so a keyboard and a tap reach it; on a
 *  phone the sheet prints it under the figure instead of floating it. */
function Tip({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <span id={id} role="tooltip" className="pm-tip">
      <b>{title}</b>
      {children}
    </span>
  )
}

/** A price in the figure's type. Monthly and yearly are both printed; the kit's `data-period-show` rule
 *  (the same switch the plan cards use) shows the one that is on. */
function Price({ label, yearly, anchor }: { label: string; yearly?: string | null; anchor?: string | null }) {
  const one = (text: string, show?: 'month' | 'year', withAnchor?: boolean) => {
    const { lead, amount, per } = splitPrice(text)
    return (
      <span className="pm-price" data-period-show={show}>
        {withAnchor && anchor && (
          <s className="pm-was">
            <span className="sr-only">Was </span>
            {anchor}/mo
          </s>
        )}
        <span className="ig-n">
          {lead && <small className="pm-lead">{lead}</small>}
          {amount}
          {per && <small>{per}</small>}
        </span>
      </span>
    )
  }
  return yearly ? (
    <>
      {one(label, 'month', true)}
      {one(yearly, 'year')}
    </>
  ) : (
    one(label, undefined, true)
  )
}

/** 01 · The Space plans. Four columns on a dashed horizon, each with a floating motif: a quiet ring (Free),
 *  a gold orb (Business), three orbs with a dot travelling between them (Collective) and a small orbiting
 *  system (Network). Hover or focus a motif for what the plan adds. */
export function PlanLadderMotion({ spaces, partnerCap }: { spaces: readonly Offering[]; partnerCap: number }) {
  const by = new Map(spaces.map((o) => [o.id, o]))
  const free = by.get('free')
  const business = by.get('business')
  const collective = by.get('collective')
  const network = by.get('network')
  const nonprofit = by.get('nonprofit')
  if (!free || !business || !collective || !network) return null
  const baseChapter = `${formatCents(NETWORK_PLAN.baseCents)} + ${formatCents(NETWORK_PLAN.chapterCents)} a chapter, ${NETWORK_PLAN.includedChapters} at the least, from ${formatCents(NETWORK_PLAN.monthlyCents)}`
  return (
    <figure className="pm-fig" aria-labelledby="pm-ladder-h">
      <figcaption className="pm-head">
        <span className="ig-k">The Space plans</span>
        <h3 id="pm-ladder-h">From one Space to a whole network</h3>
      </figcaption>
      <div className="pm-ladder">
        <div className="pm-col" style={vars({ '--pm-c': 'var(--fq-x-aqua-neon)' })}>
          <div className="pm-stage">
            <div className="pm-float" style={vars({ '--pm-d': '6s' })}>
              <div className="pm-hit" tabIndex={0} role="group" aria-label={`${free.label}: what it adds`} aria-describedby="pm-t-free">
                <span className="pm-ring" />
                <Tip id="pm-t-free" title="Host free. The whole thing.">
                  {`Comes with Crew, and hosting is free after that. Tips only, with no platform fee, ${PLAN_STORY.plusProcessing}.`}
                </Tip>
              </div>
            </div>
          </div>
          <div className="pm-cap">
            <span className="ig-k">{free.label}</span>
            <Price label={free.monthly} />
            <em>A Space runs.</em>
          </div>
        </div>

        <div className="pm-col" style={vars({ '--pm-c': 'var(--fq-x-sun-neon)' })}>
          <div className="pm-stage">
            <div className="pm-float" style={vars({ '--pm-d': '7s', '--pm-o': '-2s' })}>
              <div className="pm-hit" tabIndex={0} role="group" aria-label={`${business.label}: what it adds`} aria-describedby="pm-t-business">
                <span className="pm-orb pm-orb-lg" />
                <Tip id="pm-t-business" title="Selling starts here.">
                  {`Paid tickets, memberships, donations, a shop and booking deposits, with the limits lifted. ${business.trial ?? ''}`}
                </Tip>
              </div>
            </div>
          </div>
          <div className="pm-cap">
            <span className="ig-k">{business.label}</span>
            <Price label={business.monthly} yearly={business.yearly} anchor={business.listAnchor} />
            <em>Business sells.</em>
          </div>
        </div>

        <div className="pm-col is-rec" style={vars({ '--pm-c': 'var(--pm-pink)' })}>
          <div className="pm-stage">
            {collective.featured && <span className="pm-flag">Recommended</span>}
            <div className="pm-float" style={vars({ '--pm-d': '8s', '--pm-o': '-4s' })}>
              <div className="pm-hit" tabIndex={0} role="group" aria-label={`${collective.label}: what it adds`} aria-describedby="pm-t-collective">
                <span className="pm-tri" aria-hidden="true">
                  <svg viewBox="0 0 128 116">
                    <path d="M64 26 L24 90 L104 90 Z" />
                    <circle className="pm-trav" r="2.5" />
                  </svg>
                  <span className="pm-orb pm-orb-me" />
                  <span className="pm-orb pm-orb-a" />
                  <span className="pm-orb pm-orb-b" />
                </span>
                <Tip id="pm-t-collective" title="Grow together without giving anything up.">
                  {`A hub that links up to ${partnerCap} partner Spaces, a shared calendar and Vera AI included. ${collective.betaNote ?? ''}`}
                </Tip>
              </div>
            </div>
          </div>
          <div className="pm-cap">
            <span className="ig-k">{collective.label}</span>
            <Price label={collective.monthly} yearly={collective.yearly} anchor={collective.listAnchor} />
            {collective.listAnchor && <span className="pm-pill">Beta pricing</span>}
            <em>Collective unites.</em>
          </div>
        </div>

        <div className="pm-col" style={vars({ '--pm-c': 'var(--fq-x-magenta-neon)' })}>
          <div className="pm-stage">
            <div className="pm-float" style={vars({ '--pm-d': '9s', '--pm-o': '-1s' })}>
              <div className="pm-hit pm-hit-net" tabIndex={0} role="group" aria-label={`${network.label}: what it adds`} aria-describedby="pm-t-network">
                <span className="ig-orbit pm-mini" style={vars({ '--fq-s': '152px' })} aria-hidden="true">
                  <span className="o" style={vars({ '--fq-i': '0px', '--fq-t': '46s' })}>
                    <i style={vars({ '--fq-a': '10deg', '--fq-d': '12px', '--fq-c': 'var(--fq-x-magenta-neon)' })} />
                    <i style={vars({ '--fq-a': '150deg', '--fq-d': '9px', '--fq-c': 'var(--fq-x-sun-neon)' })} />
                    <i style={vars({ '--fq-a': '270deg', '--fq-d': '10px', '--fq-c': 'var(--fq-x-aqua-neon)' })} />
                  </span>
                  <span className="o" style={vars({ '--fq-i': '16%', '--fq-t': '30s' })}>
                    <i style={vars({ '--fq-a': '60deg', '--fq-d': '8px', '--fq-c': 'var(--fq-x-aqua-neon)' })} />
                    <i style={vars({ '--fq-a': '200deg', '--fq-d': '10px', '--fq-c': 'var(--pm-pink)' })} />
                  </span>
                  <span className="core pm-core" />
                </span>
                <Tip id="pm-t-network" title="Run every chapter as one organization.">
                  {`Starts with ${NETWORK_PLAN.includedChapters} chapters at ${formatCents(NETWORK_PLAN.chapterCents)} a month each, up to ${NETWORK_PLAN.maxChapters}.${nonprofit ? ` Verified non profits pay ${formatCents(NETWORK_PLAN.nonprofitBaseCents)} plus ${formatCents(NETWORK_PLAN.nonprofitChapterCents)} a chapter.` : ''}`}
                </Tip>
              </div>
            </div>
          </div>
          <div className="pm-cap">
            <span className="ig-k">{network.label}</span>
            <Price label={network.monthly} yearly={network.yearly} />
            <span className="pm-sub">{baseChapter}</span>
            <em>Network grows.</em>
          </div>
        </div>
      </div>
      <p className="pm-foot">
        <span>Hover or tap a plan for what it adds.</span>
        {nonprofit && <span>{`Non Profit ${nonprofit.monthly}, everything Business does.`}</span>}
      </p>
      <p className="pm-foot pm-indep">
        <span>
          {`Past ${NETWORK_PLAN.maxChapters} chapters, or want your own brand and domain? Independent Network starts at ${formatCents(NETWORK_PLAN.independentYearFromCents)} a year plus a ${formatCents(NETWORK_PLAN.independentSetupCents)} setup.`}{' '}
          <a href={INDEPENDENT_CONTACT_HREF}>Talk to us about Independent</a>
        </span>
      </p>
    </figure>
  )
}

/** 02 · Collective or Network, as two living pictures. Collective: three separate owners on a dashed
 *  triangle with a dot travelling it and a shared calendar at the centre. Network: one organization with
 *  its chapters in orbit; the chapters your plan includes are lit, the ones you can add are dim. Hovering
 *  pauses the orbit. */
export function OwnersMotion({ includedChapters, maxChapters }: { includedChapters: number; maxChapters: number }) {
  // Chapter dots, spread over three orbits. The first `includedChapters` are lit.
  const orbits = [
    { k: 52.6, t: 46, n: 3 },
    { k: 70.9, t: 34, n: 4 },
    { k: 89.1, t: 24, n: 3 },
  ]
  let k = 0
  return (
    <div className="pm-own">
      <div className="pm-own-card" style={vars({ '--pm-c': 'var(--pm-pink)' })}>
        <p className="pm-own-h">
          <span className="ig-k">Collective</span>
          <b>Many owners, working together</b>
        </p>
        <div className="pm-own-art pm-coll" role="img" aria-label="Three Spaces with three different owners, linked by a shared calendar">
          <svg viewBox="0 0 340 300" aria-hidden="true">
            <path d="M170 78 L72 218 L268 218 Z" />
            <circle className="pm-trav" r="2.5" />
            <circle className="pm-trav b" r="2.5" />
          </svg>
          <div className="pm-node n1" tabIndex={0} aria-describedby="pm-o-me">
            <span className="pm-orb pm-orb-xl" />
            <Tip id="pm-o-me" title="Your Space">
              Keeps its own members, payouts and settings.
            </Tip>
            <em>Your Space</em>
          </div>
          <div className="pm-node n2" tabIndex={0} aria-describedby="pm-o-p1">
            <span className="pm-orb pm-orb-xl is-aqua" />
            <Tip id="pm-o-p1" title="Partner Space">
              A separate group with its own owner and its own members and payouts.
            </Tip>
            <em>Partner Space</em>
          </div>
          <div className="pm-node n3" tabIndex={0} aria-describedby="pm-o-p2">
            <span className="pm-orb pm-orb-xl is-mag" />
            <Tip id="pm-o-p2" title="Partner Space">
              Cross-lists Circles and Journeys with the rest of the hub.
            </Tip>
            <em>Partner Space</em>
          </div>
          <div className="pm-node cal" tabIndex={0} aria-describedby="pm-o-cal">
            <span className="pm-pulse" />
            <Tip id="pm-o-cal" title="Shared calendar">
              One calendar with every partner&apos;s events on it.
            </Tip>
          </div>
        </div>
        <p className="pm-own-p">Each keeps its own members, payouts and settings, and you share a calendar and cross-list each other&apos;s Circles and Journeys.</p>
      </div>

      <div className="pm-own-card" style={vars({ '--pm-c': 'var(--fq-x-magenta-neon)' })}>
        <p className="pm-own-h">
          <span className="ig-k">Network</span>
          <b>One owner, many chapters</b>
        </p>
        <div
          className="pm-own-art pm-net"
          role="img"
          aria-label={`One organization with its chapters in orbit. ${includedChapters} chapters to start and you can add up to ${maxChapters}.`}
        >
          {orbits.map((o) => (
            <span key={o.k} className="pm-orbit" style={vars({ '--pm-k': o.k, '--pm-t': `${o.t}s` })}>
              {Array.from({ length: o.n }, () => {
                const i = k++
                const lit = i < includedChapters
                return (
                  <i
                    key={i}
                    className={lit ? 'pm-ch is-lit' : 'pm-ch'}
                    style={vars({ '--pm-a': `${(360 / o.n) * (i % o.n) + i * 17}deg` })}
                  />
                )
              })}
            </span>
          ))}
          <div className="pm-org" tabIndex={0} aria-describedby="pm-o-org">
            <b>1</b>
            <em>organization</em>
            <Tip id="pm-o-org" title="One organization">
              {`${includedChapters} chapters to start, ${NETWORK_PLAN.centralAdmins} central admins included, one network calendar and home, and a roll-up report.`}
            </Tip>
          </div>
        </div>
        <p className="pm-own-p">One membership works in every chapter, central admins see the whole network, and each chapter leader runs their own.</p>
        <p className="pm-legend">
          <span className="is-lit">{`${includedChapters} chapters to start`}</span>
          <span>{`Add up to ${maxChapters}`}</span>
        </p>
      </div>
    </div>
  )
}

/** The links under the figures. Kept here so the page file stays one list of sections. */
export function MotionLinks() {
  return (
    <p className="pb-note">
      <Link href="/networks">See how a Network works</Link>
      {' · '}
      <Link href="/help/spaces/collective">How a Collective works</Link>
      {' · '}
      <Link href="/help/spaces/plans-and-pricing">Plans and pricing, in detail</Link>
    </p>
  )
}
