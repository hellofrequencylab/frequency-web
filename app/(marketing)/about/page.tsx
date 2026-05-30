import type { Metadata } from 'next'
import { PageHero, Section, SectionHeading, Lead, Body, BetaCTA } from '@/components/marketing/marketing-ui'

export const metadata: Metadata = {
  title: 'About',
  description:
    'The story behind Frequency, and why we won’t let it collapse this time. A place to be human, built to outlast any one person.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About Frequency',
    description: 'We’re building the place we wished existed.',
    url: '/about',
  },
}

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Our story"
        title="We&apos;re building the place we wished existed."
        subtitle="The story behind Frequency, and why we won&apos;t let it collapse this time."
      />

      <div className="px-6">
        <div className="max-w-5xl mx-auto rounded-3xl overflow-hidden border border-border shadow-sm">
          <img
            src="/images/site/community-1.jpg"
            alt="A Frequency community gathering"
            className="w-full object-cover aspect-[21/9]"
          />
        </div>
      </div>

      <Section tone="canvas">
        <SectionHeading title="It started on a cliff at Moonlight Beach." />
        <Body>
          In June 2020, a handful of people began meeting on the bluffs to
          breathe and reconnect during a season when everyone felt cut off.
          Word spread. Within eighteen months, gatherings of a thousand-plus.
        </Body>
        <Body>
          It was proof of the hunger, and proof of the problem: without
          infrastructure, even something that beautiful couldn&apos;t hold. When
          it faded, it left a blueprint of exactly what to build.
        </Body>
      </Section>

      <Section>
        <SectionHeading title="A place to be human." />
        <Lead>67% of millennials and Gen Z report feeling lonely.</Lead>
        <Body>
          It isn&apos;t for lack of people. It&apos;s for lack of places. The
          third spaces that used to hold us have quietly disappeared, and we
          replaced them with feeds. Frequency exists to rebuild that third
          space: physical homes for connection, backed by a community designed
          to last, open to anyone.
        </Body>
      </Section>

      <Section tone="canvas">
        <SectionHeading title="Built to outlast any one person." />
        <Body>
          Guru-free. Bottom-up. The environment does the work. We&apos;re not
          building a following. We&apos;re building infrastructure for
          connection that can spread, city by city, and stand on its own.
        </Body>
      </Section>

      <BetaCTA heading="Be one of the first." />
    </>
  )
}
