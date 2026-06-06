import type { Metadata } from 'next'
import {
  ArrowRight,
  Check,
  MessageSquare,
  CalendarDays,
  Users,
  Star,
  Radio,
  BarChart3,
  Sparkles,
  HeartHandshake,
  Award,
  ShieldCheck,
} from 'lucide-react'
import { Render } from '@measured/puck/rsc'
import {
  PhotoHero,
  Section,
  SectionHeading,
  ZigZag,
  Statement,
  BetaCTA,
  FaqList,
  Button,
  Card,
} from '@/components/marketing/marketing-ui'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Membership that keeps the room open. Free during beta, no card required. Crew is $10/mo when paid memberships launch, and early members lock in Founder pricing forever.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Frequency pricing: membership that keeps the room open',
    description:
      'Free during beta, no card required. Pay-it-forward membership that sustains the spaces. Founder pricing locked for early members.',
    url: '/pricing',
  },
}

export default async function PricingPage() {
  const data = await getPublishedData('pricing')
  if (data && Array.isArray(data.content) && data.content.length > 0) {
    return <Render config={config} data={data} />
  }
  return <LegacyPricing />
}

function LegacyPricing() {
  return (
    <>
      <PhotoHero
        image="/images/site/lab-lounge.jpg"
        alt="The connection bar inside The Lab, warm and low-lit"
        focal="object-center"
        eyebrow="Membership"
        title={
          <>
            Membership that keeps
            <br className="hidden sm:block" /> the room open.
          </>
        }
        subtitle="Frequency runs on circulation, not exclusion. Your membership sustains the spaces and the people in them, so connection stays within reach for the next person who walks in."
      />

      <BetaBanner />

      {/* The three tiers */}
      <Section tone="surface" pad="pt-4 pb-20 sm:pb-24">
        <div className="text-center mb-12">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
            Choose how you belong
          </p>
          <h2 className="font-display uppercase text-text text-4xl sm:text-5xl">
            One community. Three ways in.
          </h2>
          <p className="mt-4 text-xl italic text-muted max-w-2xl mx-auto">
            Start free. Upgrade when you&apos;re ready. Give more when you can.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3 lg:gap-5 items-start max-w-none">
          <TierCard
            name="Member"
            price="Free"
            cadence="forever"
            tagline="For the curious. Come see what's here."
            features={[
              'Browse circles, events, and topics near you',
              'Discover the people and practices around you',
              'Attend open gatherings and community events',
              'A profile in the founding community',
            ]}
            cta={{ label: 'Start free', href: '/sign-in' }}
            ctaStyle="secondary"
          />

          <TierCard
            name="Crew"
            price="$10"
            cadence="/mo"
            betaFree
            founder
            featured
            tagline="Full access. The whole room is yours."
            features={CREW_BENEFITS}
            cta={{ label: BETA_CTA_LABEL, href: BETA_CTA_HREF }}
            ctaStyle="primary"
          />

          <TierCard
            name="Pay it forward"
            price="$25+"
            cadence="/mo"
            future
            tagline="The heart of the model. Hold the door for a neighbor."
            features={[
              'Everything in Crew, full access',
              'Fund a membership for someone who can’t pay yet',
              'Help sustain the physical spaces directly',
              'Keep the room open for the next person',
            ]}
            cta={{ label: BETA_CTA_LABEL, href: BETA_CTA_HREF }}
            ctaStyle="secondary"
          />
        </div>

        <p className="mt-8 text-center text-sm text-subtle leading-relaxed max-w-xl mx-auto">
          Prices show what membership will cost when paid memberships launch.
          Right now, during beta, every feature is unlocked for everyone and no
          card is required.
        </p>
      </Section>

      {/* Earned, not bought */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="A note on status"
          title="Host, Guide, and Mentor are earned, not bought."
          kicker="You can't buy your way to the front of the room."
        />
        <div className="grid sm:grid-cols-3 gap-5">
          <RoleNote
            role="Host"
            text="Open your home or a space and gather people. Hosts hold the room."
          />
          <RoleNote
            role="Guide"
            text="Steady a circle over time. Guides rise from showing up, again and again."
          />
          <RoleNote
            role="Mentor"
            text="Grow other leaders. Mentors are recognized by the community, never appointed by a checkout page."
          />
        </div>
        <p className="mt-8 text-lg text-muted leading-relaxed">
          Membership is how you fund and access the community. Leadership is
          something you grow into. Frequency is leaderful by design: those
          roles come from the people, not from a price tag.
        </p>
      </Section>

      <Statement tone="surface">
        Connection should{' '}
        <span className="text-primary">circulate</span>, not be locked behind a
        velvet rope.
      </Statement>

      {/* Where your membership goes — trust beat */}
      <ZigZag
        img="/images/site/lab-lounge.jpg"
        alt="The connection bar inside The Lab"
        eyebrow="Where it goes"
        title="Your membership keeps the lights on."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          Frequency is more than an app. It&apos;s a physical home: movement
          studios, a thermal circuit, a connection bar, a floor for gatherings.
          Real rooms cost real money to keep open.
        </p>
        <p>
          Membership goes straight into sustaining those spaces and the
          community that fills them. When you can pay a little more, you cover a
          neighbor who can&apos;t pay yet. That&apos;s the whole idea:{' '}
          <strong className="text-text">circulation, not exclusion.</strong>
        </p>
      </ZigZag>

      {/* Risk reversal strip */}
      <Section tone="surface">
        <div className="grid sm:grid-cols-3 gap-5">
          <Assurance
            icon={ShieldCheck}
            title="No card required"
            text="Join the beta with two words. Billing isn't even wired up yet."
          />
          <Assurance
            icon={Award}
            title="Founder pricing, locked"
            text="Early members keep their founder rate when paid memberships launch."
          />
          <Assurance
            icon={HeartHandshake}
            title="Leave anytime"
            text="No contracts, no lock-in. Switch tiers or step away whenever you like."
          />
        </div>
      </Section>

      {/* FAQ — native details/summary, no client JS */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="Straight answers"
          title="Questions, answered plainly."
        />
        <FaqList items={FAQS} />
      </Section>

      <BetaCTA
        heading="Pull up a chair."
        body="It's free during beta, no card needed. Lock in Founder pricing, find your people, and help keep the room open."
      />
    </>
  )
}

// ── Local sub-components ──────────────────────────────────────────────────────

// Real Crew benefit list, lifted from the in-app upgrade page.
const CREW_BENEFITS = [
  'Full community feed access',
  'Join and participate in circles',
  'Create and RSVP to events',
  'Access all channels',
  'Earn Zaps and climb the leaderboard',
  'Track your crew progress',
] as const

const CREW_BENEFIT_ICONS = [
  MessageSquare,
  Users,
  CalendarDays,
  Radio,
  Star,
  BarChart3,
]

function BetaBanner() {
  return (
    <section className="px-6 -mt-2 mb-2">
      <div className="max-w-3xl mx-auto rounded-2xl border border-primary-bg bg-primary-bg/40 px-6 py-5 sm:px-8 sm:py-6">
        <div className="flex flex-wrap items-center gap-2.5 mb-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-primary-strong">
            <Sparkles className="w-4 h-4" /> Free during beta
          </span>
          <span className="text-3xs font-bold uppercase tracking-wider text-on-primary bg-primary px-2 py-0.5 rounded-md">
            Active now
          </span>
        </div>
        <p className="text-base text-text/80 leading-relaxed">
          Every feature is unlocked for everyone, free, while we&apos;re in
          beta. <strong className="text-text">No card required.</strong> Join
          now and your Founder pricing stays locked in when paid memberships
          launch.
        </p>
      </div>
    </section>
  )
}

function TierCard({
  name,
  price,
  cadence,
  tagline,
  features,
  cta,
  ctaStyle,
  featured = false,
  betaFree = false,
  founder = false,
  future = false,
}: {
  name: string
  price: string
  cadence: string
  tagline: string
  features: readonly string[]
  cta: { label: string; href: string }
  ctaStyle: 'primary' | 'secondary'
  featured?: boolean
  betaFree?: boolean
  founder?: boolean
  future?: boolean
}) {
  return (
    <Card
      tone={featured ? 'elevated' : 'feature'}
      className={`relative flex flex-col h-full p-7 sm:p-8 ${
        featured
          ? 'border-2 border-primary ring-4 ring-primary-bg lg:-translate-y-3 lg:scale-[1.02]'
          : ''
      }`}
    >
      {featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-primary text-on-primary px-4 py-1 text-xs font-black uppercase tracking-widest shadow-md">
          <Star className="w-3.5 h-3.5 fill-current" /> Most popular
        </span>
      )}

      <div className="flex items-center gap-2 mb-1">
        <h3 className="font-display uppercase text-text text-2xl">{name}</h3>
        {founder && (
          <span className="inline-flex items-center gap-1 rounded-md bg-signal-bg px-2 py-0.5 text-3xs font-bold uppercase tracking-wider text-signal-strong">
            <Award className="w-3 h-3" /> Founder
          </span>
        )}
      </div>

      <p className="text-sm text-muted leading-relaxed mb-5 min-h-[2.5rem]">
        {tagline}
      </p>

      {/* Price block */}
      <div className="mb-6">
        {betaFree ? (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-black text-subtle line-through">
              {price}
            </span>
            <span className="font-display uppercase text-text text-4xl leading-none">
              Free
            </span>
            <span className="text-sm font-semibold text-primary-strong">
              during beta
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="font-display uppercase text-text text-4xl leading-none">
              {price}
            </span>
            <span className="text-base text-muted">{cadence}</span>
          </div>
        )}
        <p className="mt-1.5 text-xs text-subtle">
          {betaFree
            ? `$10/mo when paid memberships launch`
            : future
              ? 'When paid memberships launch'
              : ' '}
        </p>
      </div>

      {/* Features */}
      <ul className="space-y-3 mb-8 flex-1">
        {features.map((label, i) => {
          const Icon = featured ? CREW_BENEFIT_ICONS[i] ?? Check : Check
          return (
            <li key={label} className="flex items-start gap-3">
              <span
                className={`shrink-0 w-6 h-6 mt-0.5 rounded-lg flex items-center justify-center ${
                  featured ? 'bg-primary-bg/60' : 'bg-success-bg/30'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 ${
                    featured ? 'text-primary-strong' : 'text-success'
                  }`}
                />
              </span>
              <span className="text-sm text-text leading-snug">{label}</span>
            </li>
          )
        })}
      </ul>

      {/* CTA */}
      <Button
        href={cta.href}
        variant={ctaStyle === 'primary' ? 'primary' : 'secondary'}
        className="w-full"
      >
        {cta.label}
        {ctaStyle === 'primary' && <ArrowRight className="w-4 h-4" />}
      </Button>
    </Card>
  )
}

function RoleNote({ role, text }: { role: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-2">
        <Award className="w-4 h-4 text-primary-strong" />
        <h3 className="font-display uppercase text-text text-xl">{role}</h3>
      </div>
      <p className="text-sm text-muted leading-relaxed">{text}</p>
    </div>
  )
}

function Assurance({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  text: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary-bg/50 mb-4">
        <Icon className="w-5 h-5 text-primary-strong" />
      </div>
      <h3 className="font-bold text-text text-lg mb-1.5">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{text}</p>
    </div>
  )
}

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Is it really free right now?',
    a: 'Yes. Frequency is in free beta: every feature is unlocked for everyone, and we don’t ask for a card to join. The prices on this page are what membership will cost later, so you know what you’re locking in.',
  },
  {
    q: 'What happens after beta?',
    a: 'When paid memberships launch, Crew will be $10/mo. Everyone who joins during the beta keeps Founder pricing, locked in for you, as a thank-you for being early. We’ll give you plenty of notice before anything changes, and you’ll never be charged without choosing to.',
  },
  {
    q: 'Do I have to pay to attend anything?',
    a: 'No. Members can browse and attend open gatherings for free, forever. Crew unlocks the full community: feed, circles, events you create, channels, Zaps, and crew progress. But showing up and meeting people never costs you anything during beta.',
  },
  {
    q: 'Can I leave anytime?',
    a: 'Always. There are no contracts and no lock-in. You can switch between Member and Crew freely during beta, and step away whenever you like.',
  },
  {
    q: 'Where does the money go?',
    a: 'Into keeping the room open. Membership sustains the physical spaces, the studios, the thermal circuit, the connection bar, and the community that gathers in them. People who pay more cover neighbors who can’t pay yet. Circulation, not exclusion.',
  },
  {
    q: 'What about refunds?',
    a: 'Nothing to refund during beta, since nothing is charged. When paid memberships launch, we’ll publish clear billing and refund terms before you ever enter a card, and you can cancel at any time.',
  },
  {
    q: 'Can I buy my way into a Host or Guide role?',
    a: 'No, and that’s on purpose. Host, Guide, and Mentor are earned by showing up and looking after the people around you. Frequency is leaderful by design: those roles come from the community, never from a checkout page.',
  },
]

