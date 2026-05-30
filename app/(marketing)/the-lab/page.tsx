import type { Metadata } from 'next'
import { PageHero, Section, SectionHeading, Lead, Body, BetaCTA } from '@/components/marketing/marketing-ui'

export const metadata: Metadata = {
  title: 'The Lab',
  description:
    'The Frequency Lab is a third space engineered for your nervous system — somewhere to move, gather, cool down, and come back to yourself.',
  alternates: { canonical: '/the-lab' },
  openGraph: {
    title: 'The Lab — Frequency',
    description:
      'A third space built to be felt: movement studios, a thermal circuit, a connection bar, and an events floor.',
    url: '/the-lab',
  },
}

export default function TheLabPage() {
  return (
    <>
      <PageHero
        eyebrow="The third space"
        title="A place built to be felt."
        subtitle="The Frequency Lab is a third space engineered for your nervous system — somewhere to move, gather, cool down, and come back to yourself."
      />

      <Section tone="canvas">
        <SectionHeading title="Not a gym. Not a café. Not a studio. All of it — on purpose." />
        <Lead>
          The Lab is a single space designed to do what scattered places can&apos;t:
          hold a whole arc of a day.
        </Lead>
        <Body>
          Arrive frazzled, leave regulated. Come alone, leave known. The
          environment does the work — light, sound, temperature, and the people
          around you all tuned to bring you back to yourself.
        </Body>
      </Section>

      <Section>
        <SectionHeading eyebrow="Inside" title="What you&apos;ll find" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Feature title="Movement studios" body="Breathwork, yoga, and somatic practice — the daily reset." />
          <Feature title="The thermal circuit" body="Sauna and cold plunge: the contrast at the center of it all." />
          <Feature title="The connection bar" body="Coffee and conversation — the lingering place where strangers become regulars." />
          <Feature title="The events floor" body="Talks, sound, ceremony, and celebration when the community gathers." />
        </div>
      </Section>

      <Section tone="canvas">
        <SectionHeading title="Designed to spread." />
        <Body>
          The first Lab is a prototype — a flagship rooted in one neighborhood.
          It&apos;s built so that what works here can open in your city next.
          The community comes first; the Lab is where it gets a body.
        </Body>
      </Section>

      <BetaCTA
        heading="Be part of building it."
        body="The community is how the Lab begins. Join the Beta and help it take shape."
      />
    </>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h3 className="text-base font-bold text-text mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{body}</p>
    </div>
  )
}
