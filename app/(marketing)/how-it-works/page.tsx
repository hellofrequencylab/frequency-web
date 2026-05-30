import type { Metadata } from 'next'
import { PageHero, Section, SectionHeading, Lead, Body, BetaCTA } from '@/components/marketing/marketing-ui'

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'Frequency is built bottom-up, from the people, not the org chart. Interests, Circles, and the gatherings that grow from them.',
  alternates: { canonical: '/how-it-works' },
  openGraph: {
    title: 'How Frequency works',
    description: 'Interests and Circles. Community with a shape, built to last.',
    url: '/how-it-works',
  },
}

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="The model"
        title="Community with a shape."
        subtitle="Frequency is built bottom-up, from the people, not the org chart. Two words are all you need to belong: an Interest, and a Circle."
      />

      <Section tone="canvas">
        <SectionHeading title="Interests and Circles" />
        <Body>
          <strong className="text-text">Interests</strong> are the global topics
          you practice: Movement, Spirituality, Holistic Health, Human Relating,
          Activism, Creative, Business Support. They connect you to people
          everywhere who care about the same things.
        </Body>
        <Body>
          <strong className="text-text">Circles</strong> are small, local groups
          gathered around an Interest. Every Circle has an always-on virtual
          space, and some also meet in person. This is where you actually show
          up and belong.
        </Body>
      </Section>

      <Section>
        <SectionHeading eyebrow="How it grows" title="Nothing is appointed. Everything emerges." />
        <Lead>Circles are designed to divide and spread.</Lead>
        <Body>
          You don&apos;t wait for permission to start a Circle. When one fills,
          it seeds a new one. Neighbouring Circles cluster into a neighborhood;
          neighborhoods cluster into a whole local community. Leaders rise from
          showing up, not from being appointed. The structure follows the life,
          never the other way around.
        </Body>
      </Section>

      <Section tone="canvas">
        <SectionHeading title="Guru-free. By design." />
        <Body>
          Communities built around one charismatic person collapse when that
          person leaves. Frequency is built to outlast any one of us. The
          practices, the places, and the people are the point.
        </Body>
      </Section>

      <BetaCTA
        heading="Find your people."
        body="Pick what you practice, join a Circle near you, and start showing up."
      />
    </>
  )
}
