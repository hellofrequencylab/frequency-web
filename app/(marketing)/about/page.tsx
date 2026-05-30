import type { Metadata } from 'next'
import { Render } from '@measured/puck/rsc'
import { PageHero, ZigZag, Statement, BetaCTA } from '@/components/marketing/marketing-ui'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'

export const revalidate = 3600

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

export default async function AboutPage() {
  const data = await getPublishedData('about')
  if (data && Array.isArray(data.content) && data.content.length > 0) {
    return <Render config={config} data={data} />
  }
  return <LegacyAbout />
}

function LegacyAbout() {
  return (
    <>
      <PageHero
        eyebrow="Our story"
        title="We&apos;re building the place we wished existed."
        subtitle="A story that started on a beach, fell apart, and left behind a blueprint for doing it right."
      />

      {/* Image band */}
      <div className="px-6">
        <div className="max-w-5xl mx-auto rounded-3xl overflow-hidden border border-border shadow-sm">
          <img
            src="/images/site/community-1.jpg"
            alt="A Frequency community gathering"
            className="w-full object-cover aspect-[21/9]"
          />
        </div>
      </div>

      {/* Moonlight */}
      <ZigZag
        img="/images/site/moonlight-2.jpg"
        alt="A gathering on the bluffs at Moonlight Beach"
        eyebrow="2020"
        title="It started on a cliff at Moonlight Beach."
        imgAspect="portrait"
        imgPosition="top"
        reverse
        tone="canvas"
      >
        <p>
          In a season when everyone felt cut off, a handful of people started
          meeting on the bluffs at dawn. Just breath, cold air, and each other.
        </p>
        <p>
          Word got out. Within eighteen months, a thousand people were showing
          up to breathe together at sunrise. No marketing, no membership, no
          brand. Just a hunger for something real that nobody could quite name.
        </p>
      </ZigZag>

      <Statement tone="surface">
        It proved the hunger is{' '}
        <span className="text-primary">enormous</span>.
      </Statement>

      {/* The lesson */}
      <ZigZag
        img="/images/site/moonlight-1.jpg"
        alt="A Frequency community embracing"
        eyebrow="The hard part"
        title="And then it fell apart."
        imgAspect="landscape"
      >
        <p>
          A thousand people, and nowhere to put them. No home, no infrastructure,
          no way to hold what had been built. It depended entirely on a few
          people&apos;s energy, and energy runs out.
        </p>
        <p>
          When it faded, it left something behind: a painfully clear picture of
          exactly what to build so that next time, it could last.
        </p>
      </ZigZag>

      {/* The mission */}
      <ZigZag
        img="/images/site/lab-lounge.jpg"
        alt="A warm Frequency third space"
        eyebrow="Why we exist"
        title="A place to be human."
        imgAspect="landscape"
        reverse
        tone="canvas"
      >
        <p>
          67% of millennials and Gen Z report feeling lonely. Not for lack of
          people, but for lack of places. The third spaces that used to hold us,
          the café, the square, the gathering ground, quietly disappeared.
        </p>
        <p>
          Frequency exists to rebuild them: real physical homes for connection,
          backed by a community designed to last, and kept open to anyone
          regardless of what they can pay.
        </p>
      </ZigZag>

      <Statement tone="surface">
        We&apos;re not building a following. We&apos;re building{' '}
        <span className="text-primary">infrastructure</span>.
      </Statement>

      <BetaCTA
        heading="Be one of the first."
        body="This time it gets a home. Add your name and help us build it right."
      />
    </>
  )
}
