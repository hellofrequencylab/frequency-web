// The /pricing page body, one component per section. page.tsx composes these in order; it keeps the
// data loading, the metadata, the JSON-LD, the published-document branch and the two toggle scopes.
// Every figure is still read off the offering model passed in, never typed (see page.tsx's header).
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
  Section,
  SectionHeading,
  BlockHeading,
  Statement,
  FaqList,
  Card,
  cardClasses,
} from '@/components/marketing/marketing-ui'
import {
  ComparisonTable,
  type ComparisonColumn,
  type ComparisonGroup,
} from '@/components/marketing/comparison-table'
import { Illustration } from '@/components/marketing/illustrations'
import { PricingComparison } from '@/components/marketing/pricing-comparison'
import { PricingAudienceToggle, PricingBillingToggle } from '@/components/marketing/pricing-billing-toggle'
import { annualDiscountNote, formatBps } from '@/lib/pricing/display'
import {
  memberFeatureGrid,
  spaceFeatureGrid,
  type FeatureGrid,
  type Offering,
  type PlanExtra,
  type PricingGridInput,
} from '@/lib/pricing/pricing-grid'
import { MISSION_FRAMING, PLAN_STORY } from '@/lib/pricing/pricing-page'
import { feeFigure } from './pricing-faq'
import { PlanCard, PlanCta, PlanPrice } from './plan-cards'

export function PricingMission() {
  // Mission framing, stated plainly, with the "we only earn when you do" infographic.
  return (
    <Section tone="canvas">
      <div className="mx-auto mb-6 h-28 w-full max-w-xs">
        <Illustration name="earn-together" className="h-full" />
      </div>
      <p className="text-center text-body-lg leading-relaxed text-muted sm:text-lead">{MISSION_FRAMING}</p>
    </Section>
  )
}

export function PricingToggleCss() {
  // The CSS behind the two toggle islands: hide the interval and the audience the wrappers are not
  // on. Each wrapper carries a data attribute; each span or panel carries the matching -show
  // attribute. No client JS in the page itself.
  return (
    <style>{`
      [data-interval='month'] [data-interval-show='year'] { display: none; }
      [data-interval='year'] [data-interval-show='month'] { display: none; }
      [data-audience='space'] [data-audience-show='personal'] { display: none; }
      [data-audience='personal'] [data-audience-show='space'] { display: none; }
    `}</style>
  )
}

export function PricingPlans({
  input,
  members,
  spaces,
}: {
  input: PricingGridInput
  members: Offering[]
  spaces: Offering[]
}) {
  // The offerings the two plan lines place (ADR-1709). The personal line is the fixed pair Member and
  // Crew (ADR-878). The Space line is the free Space, then every paid plan the advertised ladder names
  // (lib/pricing/display.ts), read off the model rather than looked up by name. Non Profit sits under
  // the three main cards as a sibling, not a fourth column: it is Business for verified nonprofits.
  const member = members[0]!
  const crew = members[1]!
  const spaceMain = spaces.filter((o) => o.id !== 'nonprofit')
  const nonprofit = spaces.find((o) => o.id === 'nonprofit')
  // Where the selling line falls on the Space line: the first card that takes payments. Read off the
  // payments gate through the offering model, so the line moves if the gate does.
  const firstSeller = spaceMain.findIndex((o) => o.sells)
  // THE PLANS (LIVE-759). Best-practice structure: one line at a time behind a "For your Space / For
  // you" toggle (Space first, because that is who reads a pricing page), one recommended card
  // (Business, read off Offering.featured), and the selling line drawn where selling opens (read off
  // Offering.sells, so it follows the payments gate). Every figure and every plan name reads off the
  // offering model; the billing toggle governs both lines.
  return (
    <Section tone="canvas" width="wide">
      <SectionHeading
        align="center"
        eyebrow="The plans"
        title="Pick the plan that fits."
        kicker="Two lines. One for the Space you run, one for you as a member. Every line starts free, you can be on both, and a free tier is the real thing rather than a sample of the one above."
      />
      <PricingAudienceToggle />
      <PricingBillingToggle yearlyNote={annualDiscountNote(input.values)} />

      <div data-audience-show="space">
        {firstSeller > 0 && (
          <div
            aria-hidden
            className="mb-3 hidden gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]"
          >
            <p
              className="border-b-2 border-border pb-2 text-center text-3xs font-black uppercase tracking-eyebrow text-muted"
              style={{ gridColumn: `1 / span ${firstSeller}` }}
            >
              Host free, tips only
            </p>
            <p
              className="border-b-2 border-primary pb-2 text-center text-3xs font-black uppercase tracking-eyebrow text-primary-strong"
              style={{ gridColumn: `${firstSeller + 1} / span ${spaceMain.length - firstSeller}` }}
            >
              Selling starts here
            </p>
          </div>
        )}
        <div className="stagger grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
          {spaceMain.map((offering) => (
            <PlanCard key={offering.id} offering={offering} />
          ))}
        </div>
        {/* Non Profit, the sibling plan, as one wide row under the main cards. */}
        {nonprofit && (
          <div className={cardClasses({ tone: 'feature', className: 'mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between' })}>
            <div className="max-w-2xl">
              <h3 className="font-display uppercase text-text text-page-title">{nonprofit.label}</h3>
              <p className="mt-1 text-body-sm font-semibold text-muted">{nonprofit.tagline}</p>
              <p className="mt-2 text-body-sm leading-relaxed text-muted">{nonprofit.forWho}</p>
            </div>
            <div className="shrink-0 sm:text-right">
              <PlanPrice offering={nonprofit} />
              <PlanCta offering={nonprofit} ink={false} featured={false} />
            </div>
          </div>
        )}
        <p className="mx-auto mt-8 max-w-2xl text-center text-body leading-relaxed text-muted">
          {PLAN_STORY.selling} {PLAN_STORY.meters}
        </p>
      </div>

      <div data-audience-show="personal">
        <div className="stagger mx-auto grid max-w-3xl items-center gap-5 sm:grid-cols-2">
          <PlanCard offering={member} />
          <PlanCard offering={crew} />
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-body leading-relaxed text-muted">
          {PLAN_STORY.crew} Neither personal tier takes payments: selling runs through a Space on
          Business, which any member can open. Tips work on both, with no fee.
        </p>
      </div>
    </Section>
  )
}

export function PricingFeeLadder({ members, spaces }: { members: Offering[]; spaces: Offering[] }) {
  // The fee ladder table's rows (every cell read off the offering model). The zero is formatted like
  // every other rate, never typed: own audience and tips are 0 on every plan.
  const feeZero = formatBps(0)
  const feeRows = feeLadderRows(spaces, members)
  // THE FEE LADDER. One table, every row read off the offering model: who takes payments, and what
  // the network fee is on the plans that do. The free and personal rungs stay in the rate vector as
  // default-deny values only, so no row quotes them.
  return (
    <Section tone="surface" width="wide">
      <SectionHeading
        eyebrow="The network fee"
        title="We charge once for the introduction."
        kicker={PLAN_STORY.rate}
      />
      {/* Focusable and named, so a keyboard user can scroll the table on a narrow screen. */}
      <div
        className="overflow-x-auto rounded-card border border-border bg-surface"
        tabIndex={0}
        role="region"
        aria-label="The network fee on each plan"
      >
        <table className="w-full min-w-[36rem] text-left text-body-sm">
          <caption className="sr-only">The network fee on each plan</caption>
          <thead className="border-b border-border text-3xs font-black uppercase tracking-eyebrow text-muted">
            <tr>
              <th scope="col" className="px-4 py-3">Plan</th>
              <th scope="col" className="px-4 py-3">Takes payments</th>
              <th scope="col" className="px-4 py-3">Your own people</th>
              <th scope="col" className="px-4 py-3">A customer the network introduces</th>
              <th scope="col" className="px-4 py-3">Tips</th>
            </tr>
          </thead>
          <tbody>
            {feeRows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <th scope="row" className="px-4 py-3 font-semibold text-text">{r.label}</th>
                <td className="px-4 py-3 text-muted">{r.sells ? 'Yes' : 'Tips only'}</td>
                <td className="px-4 py-3 text-muted">{r.sells ? feeZero : 'Not applicable'}</td>
                <td className="px-4 py-3 font-semibold text-text">{r.fee ? `${r.fee}, once` : 'Not applicable'}</td>
                <td className="px-4 py-3 text-muted">{feeZero}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

export function PricingFeatureComparison({
  input,
  members,
  spaces,
}: {
  input: PricingGridInput
  members: Offering[]
  spaces: Offering[]
}) {
  // THE COMPARISON, following the same toggle as the cards. Every cell is derived from the
  // entitlement key sets, the gates, and the meters, so it cannot drift from the product.
  return (
    <Section tone="canvas" width="wide">
      <SectionHeading
        eyebrow="The full comparison"
        title="What each plan gets."
        kicker="Every row below is read from the same rules the product runs on, so this table says what your account will actually do."
      />
      <div data-audience-show="space">
        <ComparisonBlock
          title="Spaces"
          kicker="What a Space gets on each plan, from the free Space up."
          grid={spaceFeatureGrid(input)}
          offerings={spaces}
          openId={spaces.find((o) => o.featured)?.id ?? spaces[0]!.id}
        />
      </div>
      <div data-audience-show="personal">
        <ComparisonBlock
          title="Membership"
          kicker="What you get as a person, on the free tier and on Crew."
          grid={memberFeatureGrid(input)}
          offerings={members}
          openId={members.find((o) => o.id === 'crew')?.id ?? members[0]!.id}
        />
      </div>
    </Section>
  )
}

export function PricingExtras({ extras }: { extras: PlanExtra[] }) {
  // Seats, the AI add-on and the custom domain add-on: what you can add to a plan, priced from the
  // same config.
  return (
    <Section tone="surface">
      <SectionHeading
        eyebrow="Add to a plan"
        title="Seats, AI, and your own domain, priced in the open."
        kicker="A few things ride on top of a plan instead of being one. None is a surprise line item, and each shows up in the comparison above."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {extras.map((extra) => (
          <ExtraCard key={extra.key} extra={extra} />
        ))}
      </div>
    </Section>
  )
}

export function PricingDoors() {
  // WHO IT'S FOR: the doors, each to its /for page. Teachers and families matches the /for/teachers
  // door (PR #3227). Plan names only, no figures: each door prices itself from the catalog.
  return (
    <Section tone="canvas" width="wide">
      <SectionHeading
        eyebrow="Who it's for"
        title="Find your door."
        kicker="The same plans, explained for the people who use them."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {WHO_ITS_FOR.map((door) => (
          <Link
            key={door.href}
            href={door.href}
            className={cardClasses({ tone: 'feature', className: 'group transition-colors hover:border-primary' })}
          >
            <h3 className="font-display uppercase text-text text-lead">{door.title}</h3>
            <p className="mt-2 text-body-sm leading-relaxed text-muted">{door.body}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-body-sm font-semibold text-primary-strong group-hover:underline">
              See how it works <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </Section>
  )
}

export function PricingValue() {
  // The value comparison: every Business feature vs the separate tool it replaces, totaled against
  // the one flat price. Reads the pure lib/pricing/comparison catalog.
  return (
    <Section tone="surface" width="wide">
      <SectionHeading
        eyebrow="What it replaces"
        title="One price. The whole toolbox."
        kicker="Every tool a growing business stitches together, and what each one costs on its own. On Frequency it is one login, one bill, one flat price."
      />
      <PricingComparison />
      {/* 🔴 THE ORPHAN FIX (LIVE-256): the one internal link into /vs from a page whose readers are
          already comparing tools. */}
      <p className="mt-10 text-center text-body text-muted">
        Already using one of them?{' '}
        <Link href="/vs" className="font-semibold text-primary-strong hover:underline">
          See how Frequency compares, tool by tool
        </Link>
        .
      </p>
    </Section>
  )
}

export function PricingPromises() {
  // The four brand promises that make it a collective, not a SaaS (ADR-811 §1a).
  return (
    <Section tone="canvas">
      <SectionHeading
        eyebrow="Four promises"
        title="Why people stay."
        kicker="The parts of the deal we will not move on."
      />
      <div className="mx-auto mb-8 h-28 w-full max-w-sm">
        <Illustration name="four-promises" className="h-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            title: 'We never take a cut of your own people.',
            body: 'You keep 100% of the business you bring in yourself, and every tip. We earn only on a customer the network introduces, once.',
          },
          {
            title: 'One honest price, no surprise invoices.',
            body: 'Your plan is one flat monthly price, and a fee you always see in full. Any add-on you turn on, like Vera AI or extra operator seats, is shown up front, never a hidden line item.',
          },
          {
            title: 'Month to month. Leave anytime.',
            body: 'Your people are yours. Export your contacts and your data any time. We earn your stay, we do not trap it.',
          },
          {
            title: 'See exactly what the network earned you.',
            body: 'An honest receipt: the real dollars the collective sourced for you, and what our share of that was. Nothing hidden.',
          },
        ].map((p) => (
          <Card key={p.title} tone="feature">
            <h3 className="font-display uppercase text-text text-lead">{p.title}</h3>
            <p className="mt-2 text-body-sm leading-relaxed text-muted">{p.body}</p>
          </Card>
        ))}
      </div>
    </Section>
  )
}

export function PricingThesis() {
  // The page's one-line thesis, and the model's own sentence (LIVE-253).
  return (
    <Statement tone="surface">
      You pay when you{' '}
      <span className="text-primary-strong">start charging.</span>
    </Statement>
  )
}

export function PricingStatus() {
  // Earned, not bought: roles never come from a checkout.
  return (
    <Section tone="canvas">
      <SectionHeading
        eyebrow="A note on status"
        title="Host, Guide, and Mentor are earned, not bought."
        kicker="You cannot buy your way to the front of the room."
      />
      <p className="text-body-lg leading-relaxed text-muted">
        A plan is how you run a Space. Leadership in the community is something you grow into. Host,
        Guide, and Mentor come from showing up and looking after the people around you, never from a
        checkout page.
      </p>
    </Section>
  )
}

export function PricingFaq({ faq }: { faq: { q: string; a: string }[] }) {
  return (
    <Section tone="surface">
      <SectionHeading eyebrow="Straight answers" title="Questions, answered plainly." />
      <FaqList items={faq} />
    </Section>
  )
}

/** The "who it's for" doors. Copy and routes only; each door prices itself from the catalog. */
const WHO_ITS_FOR: readonly { title: string; body: string; href: string }[] = [
  {
    title: 'Coaches and healers',
    body: 'Sessions, packages and a client list that remembers who to follow up with.',
    href: '/for/coaches-and-healers',
  },
  { title: 'Studios', body: 'Classes, memberships and check-in at the door.', href: '/for/studios' },
  { title: 'Event hosts', body: 'Events, tickets and a way to reach everyone who came.', href: '/for/event-hosts' },
  {
    title: 'Community builders',
    body: 'Circles, gatherings and the people who keep showing up.',
    href: '/for/community-builders',
  },
  {
    title: 'Teachers and families',
    body: 'Classes, homeschool groups and family circles. A free Space holds the calendar, the people and the updates.',
    href: '/for/teachers',
  },
  { title: 'Nonprofits', body: 'Donations, supporters and programs, with no network fee.', href: '/for/nonprofits' },
]

/** The fee ladder rows: one per Space plan and one for the personal tiers, every cell read off the
 *  offering model. */
function feeLadderRows(spaces: Offering[], personal: Offering[]) {
  return [
    ...spaces.map((o) => ({
      id: o.id,
      label: offeringRowLabel(o),
      sells: o.sells,
      fee: o.sells ? feeFigure(o) : null,
    })),
    {
      id: 'personal',
      label: personal.map((o) => o.label).join(' and '),
      sells: false,
      fee: null,
    },
  ]
}

/** A Space offering's label in a flat list: the free Space reads "Free Space" beside the other plans. */
function offeringRowLabel(o: Offering): string {
  return o.axis === 'plan' && o.tier === 'free' ? 'Free Space' : o.label
}

function ExtraCard({ extra }: { extra: PlanExtra }) {
  return (
    <Card tone="feature">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display uppercase text-text text-page-title">{extra.label}</h3>
        <span className="font-display text-primary-strong text-lead">{extra.price}</span>
      </div>
      <p className="mt-2 text-body-sm leading-relaxed text-muted">{extra.detail}</p>
      <p className="mt-2 text-body-sm font-semibold text-text">{extra.availability}</p>
    </Card>
  )
}

// ── The comparison grid ──────────────────────────────────────────────────────
// This block used to carry its own desktop table, its own mobile stack, and its own `Cell` — a second
// implementation of the one the value comparison further down the page already had. Both now compose
// components/marketing/comparison-table.tsx. What is left here is the ADAPTER: the pure FeatureGrid
// (columns + grouped rows, resolved from the entitlement key sets) mapped onto that renderer's shape,
// with the price furniture a plan column carries in its header and on its mobile summary.

function ComparisonBlock({
  title,
  kicker,
  grid,
  offerings,
  openId,
}: {
  title: string
  kicker: string
  grid: FeatureGrid
  offerings: Offering[]
  openId: string
}) {
  const priceById = new Map(offerings.map((o) => [o.id, o]))

  const columns: ComparisonColumn[] = grid.columns.map((column) => {
    const offering = priceById.get(column.id)
    return {
      id: column.id,
      label: column.label,
      emphasis: offering?.featured ?? false,
      summary: offering?.monthly,
      note: (
        <span className="flex items-baseline gap-1.5">
          {offering?.listAnchor && (
            <span className="text-2xs font-semibold text-muted line-through">{offering.listAnchor}</span>
          )}
          <span className="text-body-sm font-bold text-primary-strong">{offering?.monthly}</span>
        </span>
      ),
    }
  })

  const groups: ComparisonGroup[] = grid.groups.map((group) => ({
    key: group.key,
    label: group.label,
    rows: group.rows.map((row) => ({
      key: row.key,
      label: row.label,
      detail: row.detail,
      cells: row.cells,
    })),
  }))

  return (
    <div>
      <BlockHeading title={title} kicker={kicker} />
      <ComparisonTable
        caption={`${title}: what each plan includes`}
        rowHeader="Feature"
        columns={columns}
        groups={groups}
        mobile="by-column"
        openId={openId}
      />
    </div>
  )
}
