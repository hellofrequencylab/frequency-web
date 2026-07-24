import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import { PageHero, Section, Card, Button } from '@/components/marketing/marketing-ui'
import { Illustration, type IllustrationName } from '@/components/marketing/illustrations'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'

// The role picker (ADR-180 keeps this a coded page, not a Puck slug). One decision:
// Build, Practice, or Spread. Each card routes to a DISTINCT destination that keeps its
// own promise and carries the reader's choice forward as a real signal the induction
// consumes: `?persona=` pre-selects the picker, branches the tour reel, and is stamped
// on the member; `?seq=` picks the playable-practice funnel. (Earlier all three cards
// pointed at a param-less /onboarding/beta, so the door you picked was thrown away.)
// The assignable lead flows still live under /start/[flow].
export const revalidate = 3600

export function generateMetadata(): Metadata {
  return {
    title: 'Where do you want to start?',
    description:
      'Three ways into Frequency: lead a Circle, do a practice today, or bring one person. Pick the door that fits and we point you at your first move.',
    alternates: { canonical: '/start' },
    openGraph: {
      title: 'Where do you want to start? · Frequency',
      description:
        'Build, Practice, or Spread. Pick the door that fits and we point you at your first move.',
      url: '/start',
    },
  }
}

type Role = {
  illustration: IllustrationName
  label: string
  blurb: string
  cta: string
  href: string
}

// Each door carries the choice forward. Build and Spread enter the induction pre-set
// to the persona that keeps their promise (builder = lead a Circle, visitor = find and
// gather your people). Practice opens the playable breathwork funnel, so "do one practice
// today" is literal: you take a real breathing round before you ever sign up.
const ROLES: Role[] = [
  {
    illustration: 'lead',
    label: 'Build',
    blurb: 'Be the reason your people have somewhere to go. Host one Circle and we hand you the format.',
    cta: 'Start one Circle',
    href: '/onboarding/beta?persona=builder&flow=welcome',
  },
  {
    illustration: 'practice',
    label: 'Practice',
    blurb: 'Start where you are, today. Take one breathing round now, on your own, before you sign up.',
    cta: 'Do one practice today',
    href: '/onboarding/beta?seq=breathwork',
  },
  {
    illustration: 'spread',
    label: 'Spread',
    blurb: 'Take a small role in building community around you. Bring one person, host once, or share the idea.',
    cta: 'Bring one person',
    href: '/onboarding/beta?persona=visitor&flow=welcome',
  },
]

export default function StartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Start', path: '/start' }])} />
      <PageHero
        eyebrow="Pick your way in"
        title={
          <>
            Where do you want to <span className="text-primary">start?</span>
          </>
        }
        subtitle="The third place is gone, and ordinary people are rebuilding it where they live. There are three ways to be one of them. Pick the one that fits you."
      />

      <Section tone="canvas" pad="pb-24 sm:pb-28 pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {ROLES.map((role) => (
            <Card key={role.label} tone="feature" className="flex flex-col text-center">
              <div className="h-28 mb-5 flex items-center justify-center">
                <Illustration name={role.illustration} className="h-full" />
              </div>
              <h2 className="font-display uppercase text-text text-2xl mb-2">{role.label}</h2>
              <p className="text-base text-muted leading-relaxed mb-6">{role.blurb}</p>
              <div className="mt-auto">
                <Button href={role.href} size="sm">
                  {role.cta} <ArrowRight className="w-4 h-4" aria-hidden />
                </Button>
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-subtle">
          Not sure yet? Any door works. You can change your mind, and most people end up doing a little of all three.
        </p>
      </Section>
    </>
  )
}
