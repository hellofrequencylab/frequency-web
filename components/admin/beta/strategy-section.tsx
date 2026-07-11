import { ArrowUpRight, Sprout, Megaphone, Compass, Store } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'

// STRATEGY — the always-visible launch brief (Wave 2). The why behind the Beta, the
// bets, and the guardrails, kept as a plain-language reference the operator can scan
// while working the Phases and Timeline tabs. Static Server Component: no fetch, no
// send. Voice canon (docs/CONTENT-VOICE.md): plain sentences, proper nouns carry the
// magic, no em dashes.
//
// The source of truth for the strategy narrative is the launch playbook in Notion
// (instructional/strategy → Notion, per docs/DOCS-PROTOCOL.md). PLAYBOOK_URL points
// at the "Web Platform — Training & Strategy" workspace; update it if the page moves.
const PLAYBOOK_URL = 'https://www.notion.so/96c7149011144c73954788b5140126ed'

interface Bullet {
  term: string
  body: string
}

function StrategyCard({
  icon: Icon,
  title,
  intro,
  bullets,
}: {
  icon: LucideIcon
  title: string
  intro: string
  bullets: Bullet[]
}) {
  return (
    <div className="space-y-4 rounded-3xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
        <h3 className="text-base font-bold text-text">{title}</h3>
      </div>
      <p className="text-sm text-muted">{intro}</p>
      <dl className="space-y-3">
        {bullets.map((b) => (
          <div key={b.term} className="rounded-2xl bg-surface-elevated px-4 py-3">
            <dt className="text-sm font-semibold text-text">{b.term}</dt>
            <dd className="mt-0.5 text-sm text-muted">{b.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

const GROWTH: Bullet[] = [
  {
    term: 'Lone wolf to local host',
    body: 'A member can arrive alone and get value alone. Some of those members grow into hosts who start a Circle and bring the people around them. The model plans for both, and treats the lone wolf as the default, not the exception.',
  },
  {
    term: 'Single-player value first',
    body: 'The product has to be worth it for one person with no friends on it yet. A daily practice, a Journey, and a feed that pays off solo. Group value stacks on top of that, it does not replace it.',
  },
  {
    term: 'Do not pick the city',
    body: 'We do not hand-pick a launch city and pour everything into it. We let hosts self-select from wherever they already are, then support the places that show real pull. Density is earned, not assigned.',
  },
]

const CAMPAIGNS: Bullet[] = [
  {
    term: 'Invite-gate and waitlist',
    body: 'The front door is an invite-gate with a waitlist behind it. Newcomers raise their hand, we admit in waves, and every wave passes through the approval queue before it sends.',
  },
  {
    term: 'Founding Members and Founding Businesses',
    body: 'Founding spots are reserve-now, charge-on-Sept-1. People and businesses lock their place ahead of launch and are not billed until the doors open on September 1.',
  },
  {
    term: 'Referral and the Circle-starter contest',
    body: 'Members invite members through referral, and a Circle-starter contest rewards the people who stand up the first real Circles. Both feed the same waitlist the waves draw from.',
  },
]

const METRICS: Bullet[] = [
  {
    term: 'Weekly Active Members',
    body: 'The north star. Members with at least one verified practice in the week. Everything else is a leading indicator of this.',
  },
  {
    term: 'Activation',
    body: 'A new member reaches their first verified practice within seven days. This is the single-player promise landing.',
  },
  {
    term: 'Retention',
    body: 'Members who came back this week having been active last week. The read on whether the loop holds.',
  },
  {
    term: 'Graduation',
    body: 'A Beta member converts to a Founding Member. The proof that the early cohort wants to stay and pay.',
  },
]

const BUSINESS: Bullet[] = [
  {
    term: 'Reserve now, buy down the fee',
    body: 'Founding Businesses reserve ahead of Sept 1 and lock a reduced platform fee for doing it early. The buydown lowers the cost of being first, so the businesses that anchor a local scene have a reason to commit before the crowd arrives.',
  },
]

export function BetaStrategySection() {
  return (
    <div className="space-y-8">
      <AdminSection
        title="The launch strategy"
        description="The why behind the Beta, the bets, and the guardrails. This is the reference to keep open while you work the phases and the timeline."
        actions={
          <a
            href={PLAYBOOK_URL}
            target="_blank"
            rel="noreferrer"
            className={buttonClasses('secondary', 'sm')}
          >
            Open the launch playbook
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <StrategyCard
            icon={Sprout}
            title="The growth model"
            intro="How members show up and how a scene forms around them."
            bullets={GROWTH}
          />
          <StrategyCard
            icon={Megaphone}
            title="The campaign stack"
            intro="The moves that fill the waitlist and turn interest into founding commitment."
            bullets={CAMPAIGNS}
          />
          <StrategyCard
            icon={Compass}
            title="The four north-star metrics"
            intro="The numbers that tell us the launch is working, in order of what they prove."
            bullets={METRICS}
          />
          <StrategyCard
            icon={Store}
            title="The business fee-buydown"
            intro="How we get the businesses that anchor a local scene to commit early."
            bullets={BUSINESS}
          />
        </div>
      </AdminSection>
    </div>
  )
}
