// /networks on the Frequency design (SCAN-961): the page for one organization running many chapters,
// the Network plan (owner ruling 2026-10-15). Every figure reads NETWORK_PLAN (lib/pricing/plans.ts),
// and the fee reads the take-rate ladder, so nothing here is typed money. While Network has no Stripe
// price the button opens an email, never checkout (networkCheckoutOpen).
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import '@/app/themes/active/site-pages-b'
import { NETWORK_PLAN, networkCheckoutOpen, networkFoundingYearCents, networkPackageYearCents } from '@/lib/pricing/plans'
import { COLLECTIVE_FOUNDING_ENDS_LABEL, networkFoundingOpen } from '@/lib/pricing/beta'
import { formatBps, formatCents } from '@/lib/pricing/display'
import { PRICING_DEFAULTS } from '@/lib/pricing/defaults'
import { NETWORK_TAKE_RATE_DEFAULT } from '@/lib/billing/pricing-keys'
import { PLAN_STORY } from '@/lib/pricing/plan-story'
import { INDEPENDENT_CONTACT_HREF, NETWORK_CONTACT_HREF } from '@/lib/pricing/network-contact'
import { OPERATOR_START_HREF } from '@/lib/site'
import { CollectiveOrNetwork, WhoSeesWhat } from '../pricing/tier-graphics'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

/** What a Network includes, in the order a chapter organization asks about it. Copy only; the counts
 *  read NETWORK_PLAN. */
export function networkIncludes(): { title: string; body: string }[] {
  return [
    { title: 'A chapter tree', body: `Your organization's Space at the top and up to ${NETWORK_PLAN.maxChapters} chapters beneath it (${NETWORK_PLAN.includedChapters} to start), each with its own page, Circles, events and Business tools.` },
    { title: 'Chapter leaders', body: 'Each chapter has its own leaders. They run their chapter day to day and only see their own chapter.' },
    { title: 'Central admins', body: `Up to ${NETWORK_PLAN.centralAdmins} people on your central team see the whole network and set the standards.` },
    { title: 'One membership', body: 'A member who joins the network is a member in every chapter. They pay once and belong everywhere.' },
    { title: 'One calendar and home', body: 'Every chapter event shows on one network calendar and one public network home, so people find the chapter near them.' },
    { title: 'A roll-up report', body: 'Members, events and earnings across every chapter in one private report, with nobody counted twice.' },
    { title: 'Vera AI and your domain', body: 'Vera AI and a custom domain are included, the same as Collective.' },
  ]
}

export function FrequencyNetworks() {
  const quote = !networkCheckoutOpen()
  const cta = quote ? { href: NETWORK_CONTACT_HREF, label: `${NETWORK_PLAN.quoteLabel} →` } : { href: OPERATOR_START_HREF, label: 'Start a Network →' }
  const fee = formatBps(NETWORK_TAKE_RATE_DEFAULT.network)
  const trialDays = PRICING_DEFAULTS.trial.days
  const foundingOpen = networkFoundingOpen()
  const foundingFirstYear = networkFoundingYearCents(NETWORK_PLAN.includedChapters) ?? 0
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
            <Link href="/pricing">Pricing</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Networks</span>
          </nav>
          <h1 className="h-xl">
            Run every chapter as <em className="fq-iri-text">one organization.</em>
          </h1>
          <p>For organizations with chapters, circles or local teams. Each chapter runs its own day. You see the whole network.</p>
          <div className="ctas">
            <a className="btn fq-iri-btn" href={cta.href}>
              {cta.label}
            </a>
            <Link className="btn btn-ghost fq-iri-rim" href="/pricing#collective-or-network">
              Compare plans
            </Link>
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="who" data-screen-label="02 Who it is for">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Network</b>One owner, many chapters
            </div>
            <h2 className="h-l">Is it a Network or a Collective?</h2>
            <p className="pb-note">
              Ask who owns the Spaces. If one organization owns them all, it is a Network. If separate groups own their
              own Spaces and want to work together, that is a Collective.
            </p>
          </div>
          <div className="tg-row two">
            <div className="tg-card">
              <CollectiveOrNetwork />
            </div>
            <div className="tg-card">
              <h3>Who sees what</h3>
              <p>Central admins see the whole network. A chapter leader sees only their own chapter, and no private conversation is opened up.</p>
              <WhoSeesWhat />
            </div>
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="includes" data-screen-label="03 What is included">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Included</b>Everything in Collective, plus
            </div>
            <h2 className="h-l">Built for chapters.</h2>
          </div>
          <div className="tg-row two">
            {networkIncludes().map((item) => (
              <div className="tg-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="price" data-screen-label="04 Price">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Price</b>Two ways to run a Network
            </div>
            <h2 className="h-l">{`From ${formatCents(NETWORK_PLAN.monthlyCents)} a month.`}</h2>
            <p className="pb-note">
              {`${formatCents(NETWORK_PLAN.baseCents)} a month plus ${formatCents(NETWORK_PLAN.chapterCents)} for each chapter, with ${NETWORK_PLAN.includedChapters} chapters to start, up to ${NETWORK_PLAN.maxChapters}. Verified non profits pay ${formatCents(NETWORK_PLAN.nonprofitBaseCents)} plus ${formatCents(NETWORK_PLAN.nonprofitChapterCents)} a chapter. The year is two months free. ${trialDays}-day free trial.`}
            </p>
          </div>
          <div className="tg-row two">
            <div className="tg-card">
              <h3>Partner Network</h3>
              <p>
                {`You keep your chapters in the Frequency community. Your network and every chapter wear the Frequency Partner badge, your events show on the Frequency calendar, and tickets and memberships run through Frequency checkout. You are listed where people look for things to do, and on a customer Frequency introduced to you we take ${fee} once, at their first purchase. Your own people are always free of it, ${PLAN_STORY.plusProcessing}.`}
              </p>
              <p>{`Yearly package: ${NETWORK_PLAN.packageChapters} chapters for the price of ${NETWORK_PLAN.packagePaidChapters}, ${formatCents(networkPackageYearCents())} a year. It includes a live onboarding session, priority support and a yearly network health review.`}</p>
              {foundingOpen && (
                <p>{`Founding offer: choose the year and get it for nine months. ${formatCents(foundingFirstYear)} for the first year of a ${NETWORK_PLAN.includedChapters}-chapter Network. Ends ${COLLECTIVE_FOUNDING_ENDS_LABEL}.`}</p>
              )}
            </div>
            <div className="tg-card">
              <h3>Independent Network</h3>
              <p>
                Your own community, fully separate from Frequency. Your brand, your domain, your members and your
                data, with no Partner badge, no Frequency listing and no network fee. We start with a call, then set
                up and onboard your whole network with you.
              </p>
              <p>{`Yearly agreement from ${formatCents(NETWORK_PLAN.independentYearFromCents)}, plus a ${formatCents(NETWORK_PLAN.independentSetupCents)} one-time setup and onboarding fee. We scope your chapters, migration and support on the call.`}</p>
              <p>
                <a className="btn btn-ghost fq-iri-rim" href={INDEPENDENT_CONTACT_HREF}>
                  Talk to us about Independent
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <KeepGoing
        title="Bring your chapters together."
        body="Tell us about your organization and how many chapters you run. We will set up your Network with you."
        primary={cta}
        secondary={{ href: '/pricing', label: 'See every plan' }}
      />
    </>
  )
}
