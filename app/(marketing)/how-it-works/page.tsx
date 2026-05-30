import type { Metadata } from 'next'
import { Render } from '@measured/puck/rsc'
import { PageHero, ZigZag, Statement, BetaCTA } from '@/components/marketing/marketing-ui'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'

export const revalidate = 3600

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

export default async function HowItWorksPage() {
  const data = await getPublishedData('how-it-works')
  if (data && Array.isArray(data.content) && data.content.length > 0) {
    return <Render config={config} data={data} />
  }
  return <LegacyHowItWorks />
}

function LegacyHowItWorks() {
  return (
    <>
      <PageHero
        eyebrow="The model"
        title="Community with a shape."
        subtitle="Most communities are a feed and a hope. Frequency has a structure that actually grows. And it only takes two words to belong."
      />

      {/* Interests + Circles */}
      <ZigZag
        img="/images/site/community-1.jpg"
        alt="A Frequency Circle gathering outdoors"
        eyebrow="Where you belong"
        title="Interests and Circles"
        imgAspect="landscape"
      >
        <p>
          An <strong className="text-text">Interest</strong> is what you
          practice: movement, breathwork, holistic health, creativity, human
          relating. It connects you to people everywhere who care about the same
          things you do.
        </p>
        <p>
          A <strong className="text-text">Circle</strong> is your people, near
          you. A small group built around an Interest, with an always-on virtual
          space, and often a standing time to meet in person. Small enough that
          you&apos;re missed when you don&apos;t show up.
        </p>
      </ZigZag>

      <Statement tone="canvas">
        Two words are all you need to{' '}
        <span className="text-primary">belong</span>.
      </Statement>

      {/* The growth loop */}
      <ZigZag
        img="/images/site/moonlight-1.jpg"
        alt="A large Frequency community gathering"
        eyebrow="How it grows"
        title="It spreads like cells, not franchises."
        imgAspect="landscape"
        reverse
        tone="surface"
      >
        <p>
          Circles are designed to divide. When one fills up, it doesn&apos;t put
          people on a waitlist. It seeds a new Circle, led by someone who was
          ready to step up.
        </p>
        <p>
          A handful of neighbouring Circles becomes a neighborhood. Neighborhoods
          become a whole local community. None of it is appointed from above. It
          grows on its own momentum, the way real things do.
        </p>
      </ZigZag>

      {/* Guru-free */}
      <ZigZag
        img="/images/site/moonlight-2.jpg"
        alt="A Frequency gathering at the beach"
        eyebrow="Why it lasts"
        title="Guru-free. By design."
        imgAspect="portrait"
        imgPosition="top"
        tone="canvas"
      >
        <p>
          Communities built around one charismatic founder live and die with
          that person. We&apos;ve all watched it happen. So Frequency is built
          to be the opposite: leaderful, not leader-dependent.
        </p>
        <p>
          Leaders rise from showing up, not from being anointed. Take the same
          structure away from any one of us and it keeps running, because the
          practices, the places, and the people were the point all along.
        </p>
      </ZigZag>

      <Statement tone="surface">
        The practices, the places, and{' '}
        <span className="text-primary">the people</span> are the point.
      </Statement>

      <BetaCTA
        heading="Find your people."
        body="Pick what you practice, find a Circle near you, and start showing up."
      />
    </>
  )
}
