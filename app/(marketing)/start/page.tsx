import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import { PageHero, Section, Card, Button } from '@/components/marketing/marketing-ui'
import { Illustration, type IllustrationName } from '@/components/marketing/illustrations'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'

// The role picker (ADR-180 keeps this a coded page, not a Puck slug). One decision:
// Lead, Practice, or Spread. Each card routes to its landing and first action. The
// onboarding flows live under /start/[flow] and are untouched by this front door.
export const revalidate = 3600

export function generateMetadata(): Metadata {
  return {
    title: 'Where do you want to start?',
    description:
      'Pick your way in. Lead a Circle, start a practice today, or take a small role in building community around you. Three ways into Frequency, one decision.',
    alternates: { canonical: '/start' },
    openGraph: {
      title: 'Where do you want to start? · Frequency',
      description:
        'Lead, Practice, or Spread. Pick the role that fits you and we will point you at your first move.',
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

const ROLES: Role[] = [
  {
    illustration: 'lead',
    label: 'Build',
    blurb: 'Be the reason your people have somewhere to go. Host one Circle and we hand you the format.',
    cta: 'Start one Circle',
    href: '/onboarding/beta',
  },
  {
    illustration: 'practice',
    label: 'Practice',
    blurb: 'Start where you are, today. Practices, Journeys, and the Mindless timer, all on your own.',
    cta: 'Do one practice today',
    href: '/onboarding/beta',
  },
  {
    illustration: 'spread',
    label: 'Spread',
    blurb: 'Take a small role in building community around you. Bring one person, host once, or share the idea.',
    cta: 'Bring one person',
    href: '/onboarding/beta',
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
